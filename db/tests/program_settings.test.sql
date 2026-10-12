-- Local test for db/add_progression_hub_and_program_settings.sql. Run via
-- scripts/test-program-settings.sh (throwaway Postgres in Docker).
\set ON_ERROR_STOP on
create role authenticated; create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create table profiles (id uuid primary key, role text default 'client');
create function public.is_coach() returns boolean language sql stable security definer as $$ select exists (select 1 from profiles where id = auth.uid() and role='coach') $$;
create table programs (id uuid primary key default gen_random_uuid(), client_id uuid references profiles(id), created_at timestamptz default now());
create table program_phases (id uuid primary key default gen_random_uuid(), program_id uuid references programs(id) on delete cascade, client_id uuid references profiles(id), phase text not null);
create table daily_checkins (id uuid primary key default gen_random_uuid(), client_id uuid references profiles(id), date date not null, weight numeric, unique (client_id, date));
create table weekly_checkins (id uuid primary key default gen_random_uuid(), client_id uuid references profiles(id), date date not null, notes text);
create table exercises (id uuid primary key default gen_random_uuid(), client_id uuid references profiles(id), name text not null, progression_method text, progression_config jsonb not null default '{}', prescribed_weight numeric, prescribed_set_at timestamptz);
alter table program_phases enable row level security;
create policy program_phases_select on program_phases for select using (client_id = auth.uid() or public.is_coach());
create policy pp_write on program_phases for all using (public.is_coach()) with check (public.is_coach());
alter table programs enable row level security;
create policy programs_sel on programs for select using (client_id = auth.uid() or public.is_coach());
alter table daily_checkins enable row level security;
create policy dc_all on daily_checkins for all using (client_id = auth.uid() or public.is_coach()) with check (client_id = auth.uid() or public.is_coach());
alter table weekly_checkins enable row level security;
create policy wc_all on weekly_checkins for all using (client_id = auth.uid() or public.is_coach()) with check (client_id = auth.uid() or public.is_coach());
grant usage on schema public, auth to authenticated;

\i /work/db/add_progression_hub_and_program_settings.sql
\i /work/db/add_progression_hub_and_program_settings.sql
grant all on all tables in schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated;

create function assert(cond boolean, msg text) returns void language plpgsql as $$ begin if cond is not true then raise exception 'ASSERT FAILED: %', msg; end if; end $$;
create function throws(sql text, expect text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then
    if sqlerrm like '%' || expect || '%' then return; end if;
    raise exception 'ASSERT FAILED: expected error containing "%" but got "%"', expect, sqlerrm;
  end;
  raise exception 'ASSERT FAILED: expected an error containing "%" but none was raised', expect;
end $$;

insert into profiles values ('00000000-0000-0000-0000-0000000000c0','coach'), ('00000000-0000-0000-0000-00000000000a','client'), ('00000000-0000-0000-0000-00000000000b','client');
insert into programs (id, client_id) values ('aaaaaaaa-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000a'), ('aaaaaaaa-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000b');
insert into program_phases (program_id, client_id, phase) values ('aaaaaaaa-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000a','Foundation'), ('aaaaaaaa-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000b','Foundation');
insert into exercises (id, client_id, name, progression_method, progression_config, prescribed_weight) values ('e0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','Bench','double_progression','{"repMin":8}',105);

select assert((select show_roadmap_to_client and progress_tracking_enabled and client_can_edit_checkins from programs where id = 'aaaaaaaa-0000-0000-0000-00000000000a'), 'defaults preserve today''s behaviour');

set role authenticated;
set test.uid = '00000000-0000-0000-0000-00000000000a';
-- defaults: roadmap visible, past edits allowed
select assert((select count(*) from program_phases) = 1, 'client sees own roadmap by default');
insert into daily_checkins (client_id, date, weight) values ('00000000-0000-0000-0000-00000000000a', current_date - 3, 180);
select assert((select count(*) from daily_checkins) = 1, 'backdating allowed by default');

-- coach turns the settings off
reset role; set test.uid = '00000000-0000-0000-0000-0000000000c0';
update programs set show_roadmap_to_client = false, client_can_edit_checkins = false where id = 'aaaaaaaa-0000-0000-0000-00000000000a';

set role authenticated;
set test.uid = '00000000-0000-0000-0000-00000000000a';
select assert((select count(*) from program_phases) = 0, 'roadmap hidden from the client at the DATA layer');
set test.uid = '00000000-0000-0000-0000-00000000000b';
select assert((select count(*) from program_phases) = 1, 'another client with the setting on still sees theirs');
set test.uid = '00000000-0000-0000-0000-0000000000c0';
select assert((select count(*) from program_phases) = 2, 'the coach always sees every roadmap');

set test.uid = '00000000-0000-0000-0000-00000000000a';
-- today's check-in is writable (and re-writable through the day)
insert into daily_checkins (client_id, date, weight) values ('00000000-0000-0000-0000-00000000000a', current_date, 181);
insert into daily_checkins (client_id, date, weight) values ('00000000-0000-0000-0000-00000000000a', current_date, 182) on conflict (client_id, date) do update set weight = excluded.weight;
select assert((select weight = 182 from daily_checkins where date = current_date), 'today can still be saved repeatedly');
-- past days can't be added or edited
select throws($$insert into daily_checkins (client_id, date, weight) values ('00000000-0000-0000-0000-00000000000a', current_date - 5, 170)$$, 'turned off editing past check-ins');
select throws($$update daily_checkins set weight = 1 where date = current_date - 3$$, 'turned off editing past check-ins');
select throws($$delete from daily_checkins where date = current_date - 3$$, 'turned off editing past check-ins');
-- weekly: this week only
insert into weekly_checkins (client_id, date) values ('00000000-0000-0000-0000-00000000000a', current_date - 2);
select throws($$insert into weekly_checkins (client_id, date) values ('00000000-0000-0000-0000-00000000000a', current_date - 21)$$, 'turned off editing past check-ins');
-- the other client is unaffected
set test.uid = '00000000-0000-0000-0000-00000000000b';
insert into daily_checkins (client_id, date, weight) values ('00000000-0000-0000-0000-00000000000b', current_date - 5, 150);
select assert((select count(*) from daily_checkins) = 1, 'a client whose coach allows edits can backdate');
-- coach unrestricted
set test.uid = '00000000-0000-0000-0000-0000000000c0';
update daily_checkins set weight = 151 where client_id = '00000000-0000-0000-0000-00000000000b';
update daily_checkins set weight = 999 where date = current_date - 3;
select assert((select weight = 999 from daily_checkins where date = current_date - 3), 'coach can edit any check-in');

-- ============================ progression method history ============================
select throws($$select assign_progression_method('e0000000-0000-0000-0000-000000000001','linear_progression','{}')$$, 'reason is required');
select assign_progression_method('e0000000-0000-0000-0000-000000000001','linear_progression','{"targetReps":5}','Stalled on double progression');
select assert((select progression_method = 'linear_progression' and (progression_config->>'targetReps')::int = 5 from exercises), 'method applied');
select assert((select prescribed_weight = 105 from exercises), 'the client''s live target is left in place');
select assert((select count(*) = 1 and bool_and(method_changed) and bool_and(from_method = 'double_progression') and bool_and(to_method = 'linear_progression')
  and bool_and(reason = 'Stalled on double progression') and bool_and((previous_state->>'prescribed_weight')::numeric = 105) and bool_and((from_config->>'repMin')::int = 8) from progression_method_history), 'change recorded with old/new, reason and previous state');
-- same-method settings change: no reason needed, still recorded, method_changed false
select assign_progression_method('e0000000-0000-0000-0000-000000000001','linear_progression','{"targetReps":6}');
select assert((select count(*) = 2 from progression_method_history) and (select not method_changed from progression_method_history order by changed_at desc limit 1), 'settings-only change is recorded without a reason');
-- identical re-save records nothing
select assert((select (assign_progression_method('e0000000-0000-0000-0000-000000000001','linear_progression','{"targetReps":6}')->>'changed')::boolean = false), 'no-op not recorded');
select assert((select count(*) = 2 from progression_method_history), 'no extra history row');
-- clearing the method is a method change and needs a reason too
select throws($$select assign_progression_method('e0000000-0000-0000-0000-000000000001', null, '{}')$$, 'reason is required');
-- client refused; history can't be rewritten
set test.uid = '00000000-0000-0000-0000-00000000000a';
select throws($$select assign_progression_method('e0000000-0000-0000-0000-000000000001','double_progression','{}','x')$$, 'Only a coach');
select assert((select count(*) = 0 from progression_method_history), 'clients cannot read the history');
set test.uid = '00000000-0000-0000-0000-0000000000c0';
update progression_method_history set reason = 'tampered';
select assert((select count(*) = 0 from progression_method_history where reason = 'tampered'), 'history cannot be updated (no policy)');
delete from progression_method_history;
select assert((select count(*) = 2 from progression_method_history), 'history cannot be deleted (no policy)');
reset role;
select 'ALL PROGRAM SETTINGS + METHOD HISTORY TESTS PASSED' as result;
