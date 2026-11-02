-- Local test for db/add_program_drafts_and_completions.sql. Run via scripts/test-program-drafts.sh
-- (throwaway Postgres in Docker; never touches Supabase).
\set ON_ERROR_STOP on
create role authenticated; create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create table profiles (id uuid primary key, role text default 'client', onboarding_complete boolean default false);
create function public.is_coach() returns boolean language sql stable security definer as $$ select exists (select 1 from profiles where id = auth.uid() and role='coach') $$;
create table programs (id uuid primary key default gen_random_uuid(), client_id uuid references profiles(id), name text, goal text, experience_level text, description text, weeks int,
  top_phase text, sub_phase text, phase text, phase_note text, start_date date, progression_model_key text, created_at timestamptz default now());
create table exercises (id uuid primary key default gen_random_uuid(), client_id uuid references profiles(id) on delete cascade, program_id uuid references programs(id) on delete set null,
  name text not null, category text, day_of_week text, sets int, reps text, is_bodyweight boolean default false, notes text, order_index int default 0, source text default 'coach',
  section text, exercise_type text, block_type text not null default 'straight_set', group_id text, retired_at timestamptz, retired_reason text);
create table workout_logs (id uuid primary key default gen_random_uuid(), client_id uuid, exercise_id uuid not null references exercises(id) on delete cascade, date date, sets int, reps int, weight numeric);
grant usage on schema public, auth to authenticated;

\i /work/db/add_program_drafts_and_completions.sql
\i /work/db/add_program_drafts_and_completions.sql
\i /work/db/update_approve_program_draft_keep_choice.sql
\i /work/db/update_approve_program_draft_keep_choice.sql
grant all on all tables in schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated;

create function assert(cond boolean, msg text) returns void language plpgsql as $$ begin if cond is not true then raise exception 'ASSERT FAILED: %', msg; end if; end $$;
create function throws(sql text, expect text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then
    if sqlerrm like '%' || expect || '%' then return; end if;
    raise exception 'ASSERT FAILED: expected error containing "%" but got "%"', expect, sqlerrm;
  end;
  raise exception 'ASSERT FAILED: expected error containing "%" but statement succeeded', expect;
end $$;

insert into profiles (id, role) values ('00000000-0000-0000-0000-00000000000c','coach'), ('00000000-0000-0000-0000-0000000000a1','client'), ('00000000-0000-0000-0000-0000000000a2','client');
-- Client A1 has an existing AI program: one exercise WITH logs, one without, one coach-added.
insert into programs (id, client_id, name, top_phase, sub_phase, phase_note, weeks) values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','Old','build','build','keep me',12);
insert into exercises (id, client_id, program_id, name, day_of_week, sets, reps, source) values
 ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000001','Logged Squat','Monday',4,'6','ai'),
 ('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000001','Unlogged Curl','Monday',3,'12','ai'),
 ('20000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000001','Coach Press','Tuesday',3,'8','coach');
insert into workout_logs (client_id, exercise_id, date, sets, reps, weight) values ('00000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-000000000001','2026-10-01',1,6,225);

insert into program_drafts (id, client_id, profile_id, payload, original_payload, session_config) values
 ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1',
  '{"program_name":"New","weeks":12,"weekly_split":[{"day":"Wednesday","focus":"Pull","exercises":[{"name":"Row","sets":4,"reps":"8","rest_seconds":90,"section":"Main Compound Lift","order_index":0,"block_type":"straight_set","group_id":"0"},{"name":"Curl","sets":3,"reps":"12","rest_seconds":60,"order_index":1}]}]}',
  '{"program_name":"New"}', '{"session_minutes":75,"arrangement":"in_person","prep":"independent","finish":"independent"}'),
 ('30000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a2',
  '{"program_name":"Broken","weekly_split":[{"day":"Monday","exercises":[{"name":"X","sets":0,"reps":"5"}]}]}','{}','{}');

-- 1. Drafts are invisible to clients and the draft alone changes nothing.
set role authenticated; select set_config('test.uid','00000000-0000-0000-0000-0000000000a1',false);
select assert((select count(*) from program_drafts) = 0, 'client must not see drafts');
select throws($$ select approve_program_draft('30000000-0000-0000-0000-000000000001') $$, 'Only a coach');
select throws($$ insert into program_drafts (client_id, payload, original_payload) values ('00000000-0000-0000-0000-0000000000a1','{}','{}') $$, 'row-level security');
reset role;
select assert((select count(*) from programs where client_id='00000000-0000-0000-0000-0000000000a1') = 1, 'unapproved draft must not create a program');
select assert((select count(*) from exercises where client_id='00000000-0000-0000-0000-0000000000a1') = 3, 'unapproved draft must not touch exercises');

-- 2. A broken draft is rejected atomically; the existing program is untouched.
set role authenticated; select set_config('test.uid','00000000-0000-0000-0000-00000000000c',false);
select throws($$ select approve_program_draft('30000000-0000-0000-0000-000000000002') $$, 'invalid rest period');
reset role;
select assert((select status from program_drafts where id='30000000-0000-0000-0000-000000000002') = 'draft', 'failed approval leaves draft open');

-- 3. Approving swaps atomically, preserves logged + coach exercises, carries the phase.
set role authenticated; select set_config('test.uid','00000000-0000-0000-0000-00000000000c',false);
select approve_program_draft('30000000-0000-0000-0000-000000000001');
reset role;
select assert((select status from program_drafts where id='30000000-0000-0000-0000-000000000001') = 'approved', 'draft approved');
select assert((select count(*) from exercises where id='20000000-0000-0000-0000-000000000001') = 1, 'logged exercise preserved');
select assert((select count(*) from workout_logs) = 1, 'workout history preserved');
select assert((select count(*) from exercises where id='20000000-0000-0000-0000-000000000002') = 0, 'unlogged AI exercise replaced');
select assert((select count(*) from exercises where id='20000000-0000-0000-0000-000000000003') = 1, 'coach-added exercise untouched');
select assert((select count(*) from exercises where client_id='00000000-0000-0000-0000-0000000000a1' and source='ai' and name in ('Row','Curl')) = 2, 'new exercises inserted');
select assert((select rest_seconds from exercises where name='Row') = 90, 'rest_seconds saved');
select assert((select count(*) from programs where client_id='00000000-0000-0000-0000-0000000000a1') = 1, 'existing program row reused, not duplicated');
select assert((select id from programs where client_id='00000000-0000-0000-0000-0000000000a1') = '10000000-0000-0000-0000-000000000001', 'same program id kept (roadmap phases stay attached)');
select assert((select program_id from exercises where id='20000000-0000-0000-0000-000000000001') = (select approved_program_id from program_drafts where id='30000000-0000-0000-0000-000000000001'), 'logged exercise belongs to the program');
select assert((select phase_note from programs where name='New') = 'keep me' and (select top_phase from programs where name='New') = 'build', 'phase tracking untouched');
select assert((select session_minutes from programs where name='New') = 75, 'session minutes stored');
select assert((select onboarding_complete from profiles where id='00000000-0000-0000-0000-0000000000a1') is true, 'onboarding complete');

-- 3b. A client with no program yet gets one created.
reset role;
update program_drafts set payload = '{"program_name":"First","weekly_split":[{"day":"Monday","exercises":[{"name":"Squat","sets":3,"reps":"5"}]}]}' where id='30000000-0000-0000-0000-000000000002';
set role authenticated; select set_config('test.uid','00000000-0000-0000-0000-00000000000c',false);
select approve_program_draft('30000000-0000-0000-0000-000000000002');
reset role;
select assert((select count(*) from programs where client_id='00000000-0000-0000-0000-0000000000a2' and name='First' and weeks=12) = 1, 'first program created with default weeks');
select assert((select count(*) from exercises where client_id='00000000-0000-0000-0000-0000000000a2' and name='Squat' and rest_seconds is null) = 1, 'missing rest stays null');

-- 3c. Coach chooses: keep one logged exercise, retire the other. Nothing with logs is deleted.
reset role;
insert into exercises (id, client_id, program_id, name, day_of_week, sets, reps, source) values
 ('20000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a2',(select id from programs where client_id='00000000-0000-0000-0000-0000000000a2'),'Keep Me','Monday',3,'5','ai'),
 ('20000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000a2',(select id from programs where client_id='00000000-0000-0000-0000-0000000000a2'),'Retire Me','Monday',3,'5','ai'),
 ('20000000-0000-0000-0000-0000000000b3','00000000-0000-0000-0000-0000000000a2',(select id from programs where client_id='00000000-0000-0000-0000-0000000000a2'),'Unlogged','Monday',3,'5','ai');
insert into workout_logs (client_id, exercise_id, date, sets, reps, weight) values
 ('00000000-0000-0000-0000-0000000000a2','20000000-0000-0000-0000-0000000000b1','2026-10-02',1,5,100),
 ('00000000-0000-0000-0000-0000000000a2','20000000-0000-0000-0000-0000000000b2','2026-10-02',1,5,100);
insert into program_drafts (id, client_id, profile_id, payload, original_payload) values ('30000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a2',
 '{"program_name":"Second","weekly_split":[{"day":"Tuesday","exercises":[{"name":"New Lift","sets":3,"reps":"5"}]}]}','{}');
set role authenticated; select set_config('test.uid','00000000-0000-0000-0000-00000000000c',false);
select approve_program_draft('30000000-0000-0000-0000-000000000003', array['20000000-0000-0000-0000-0000000000b1']::uuid[]);
reset role;
select assert((select retired_at is null from exercises where id='20000000-0000-0000-0000-0000000000b1'), 'chosen exercise stays active');
select assert((select retired_at is not null and retired_reason is not null from exercises where id='20000000-0000-0000-0000-0000000000b2'), 'unchosen logged exercise is retired, not deleted');
select assert((select count(*) from workout_logs where exercise_id='20000000-0000-0000-0000-0000000000b2') = 1, 'retired exercise keeps its history');
select assert((select count(*) from exercises where id='20000000-0000-0000-0000-0000000000b3') = 0, 'unlogged exercise replaced');
select assert((select count(*) from exercises where name='New Lift') = 1, 'new exercises added');

-- 3d. Old one-argument call still keeps every logged exercise.
update exercises set retired_at = null where id='20000000-0000-0000-0000-0000000000b2';
insert into program_drafts (id, client_id, profile_id, payload, original_payload) values ('30000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a2',
 '{"program_name":"Third","weekly_split":[{"day":"Tuesday","exercises":[{"name":"Newer Lift","sets":3,"reps":"5"}]}]}','{}');
set role authenticated; select set_config('test.uid','00000000-0000-0000-0000-00000000000c',false);
select approve_program_draft('30000000-0000-0000-0000-000000000004');
reset role;
select assert((select count(*) from exercises where id in ('20000000-0000-0000-0000-0000000000b1','20000000-0000-0000-0000-0000000000b2') and retired_at is null) = 2, 'no choice passed = keep all logged');

-- 4. A draft cannot be approved twice.
set role authenticated; select set_config('test.uid','00000000-0000-0000-0000-00000000000c',false);
select throws($$ select approve_program_draft('30000000-0000-0000-0000-000000000001') $$, 'not awaiting approval');
reset role;

-- 5. Only one open draft per client.
insert into program_drafts (client_id, payload, original_payload) values ('00000000-0000-0000-0000-0000000000a1','{}','{}');
select throws($$ insert into program_drafts (client_id, payload, original_payload) values ('00000000-0000-0000-0000-0000000000a1','{}','{}') $$, 'idx_program_drafts_one_open');

-- 6. Workout completions: client can record own, not duplicate/overwrite, not for others, not delete.
set role authenticated; select set_config('test.uid','00000000-0000-0000-0000-0000000000a1',false);
insert into workout_completions (client_id, date, day_of_week) values ('00000000-0000-0000-0000-0000000000a1','2026-11-02','Monday');
select throws($$ insert into workout_completions (client_id, date) values ('00000000-0000-0000-0000-0000000000a1','2026-11-02') $$, 'duplicate key');
select throws($$ insert into workout_completions (client_id, date) values ('00000000-0000-0000-0000-0000000000a2','2026-11-02') $$, 'row-level security');
update workout_completions set status='partial';   -- RLS hides it from update: 0 rows
delete from workout_completions;
select assert((select status from workout_completions) = 'completed', 'client cannot overwrite or delete a completion');
select set_config('test.uid','00000000-0000-0000-0000-0000000000a2',false);
select assert((select count(*) from workout_completions) = 0, 'other client cannot read it');
reset role;

select 'ALL PROGRAM DRAFT TESTS PASSED' as result;
