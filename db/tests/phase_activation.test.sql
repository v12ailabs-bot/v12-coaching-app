-- Local test for db/add_phase_activation.sql. Run via scripts/test-phase-activation.sh
-- (throwaway Postgres in Docker; never touches Supabase).
\set ON_ERROR_STOP on
create role authenticated; create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create table profiles (id uuid primary key, role text default 'client');
create function public.is_coach() returns boolean language sql stable security definer as $$ select exists (select 1 from profiles where id = auth.uid() and role='coach') $$;
create table programs (id uuid primary key default gen_random_uuid(), client_id uuid references profiles(id), phase text, phase_note text, phase_updated_at timestamptz, phase_week_start int, phase_week_end int);
create table exercises (id uuid primary key default gen_random_uuid(), client_id uuid references profiles(id) on delete cascade, program_id uuid references programs(id) on delete set null,
  name text not null, category text, day_of_week text, sets int, reps text, is_bodyweight boolean default false, notes text, order_index int default 0, source text default 'coach',
  section text, exercise_type text, block_type text not null default 'straight_set', group_id text, retired_at timestamptz, retired_reason text);
create table workout_logs (id uuid primary key default gen_random_uuid(), client_id uuid, exercise_id uuid not null references exercises(id) on delete cascade, date date, sets int, reps int, weight numeric);
create table program_phases (id uuid primary key default gen_random_uuid(), program_id uuid references programs(id) on delete cascade, client_id uuid references profiles(id), phase text not null, order_index int default 0, week_start int, week_end int, exit_criteria jsonb not null default '[]');
create table program_phase_history (id uuid primary key default gen_random_uuid(), program_id uuid, client_id uuid, phase text, phase_note text, changed_by text, changed_at timestamptz default now(), week_start int, week_end int);
grant usage on schema public, auth to authenticated;

\i /work/db/add_phase_prescription_drafts.sql
\i /work/db/add_phase_activation.sql
-- idempotent re-run
\i /work/db/add_phase_activation.sql
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

-- ---------------------------------------------------------------- seed
insert into profiles values ('00000000-0000-0000-0000-0000000000c0','coach'), ('00000000-0000-0000-0000-00000000000a','client');
insert into programs (id, client_id, phase, phase_week_start, phase_week_end) values ('aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','Foundation',1,4);
insert into program_phases (id, program_id, client_id, phase, order_index, week_start, week_end, exit_criteria) values
 ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','Foundation',0,1,4,'[{"label":"Attendance","status":"complete"},{"label":"Technique","status":"incomplete"}]'),
 ('bbbbbbbb-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','Strength',1,5,8,'[]');
insert into exercises (id, client_id, program_id, name, day_of_week, sets, reps, order_index, group_id) values
 ('e0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','Goblet Squat','Monday',3,'8-12',0,'g1'),
 ('e0000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','Bench Press','Monday',4,'5',1,'g2'),
 ('e0000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','Row','Wednesday',3,'10',0,'g3'),
 ('e0000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','Plank','Wednesday',3,'30s',1,'g4');
insert into workout_logs (client_id, exercise_id, date, sets, reps, weight) select client_id, id, '2026-10-01', 1, 10, 50 from exercises;

-- Draft: keep Bench unchanged; Goblet -> Back Squat (replace); Row sets 3->4 (in place); Plank removed; Pull-up added.
insert into phase_prescription_drafts (phase_id, program_id, client_id, exercises) values
 ('bbbbbbbb-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a', '[
  {"name":"Back Squat","day_of_week":"Monday","sets":3,"reps":"8-12","source_exercise_id":"e0000000-0000-0000-0000-000000000001"},
  {"name":"Bench Press","day_of_week":"Monday","sets":4,"reps":"5","source_exercise_id":"e0000000-0000-0000-0000-000000000002"},
  {"name":"Row","day_of_week":"Wednesday","sets":4,"reps":"10","source_exercise_id":"e0000000-0000-0000-0000-000000000003"},
  {"name":"Pull-up","day_of_week":"Wednesday","sets":3,"reps":"6-8"}]');

-- ------------------------------------------------ non-coach is refused
set test.uid = '00000000-0000-0000-0000-00000000000a';
select throws($$select activate_phase_draft('bbbbbbbb-0000-0000-0000-000000000002','note')$$, 'Only a coach');
select throws($$select undo_phase_transition(gen_random_uuid())$$, 'Only a coach');

set test.uid = '00000000-0000-0000-0000-0000000000c0';
-- ---------------------------------------------- exit-criteria gate
select throws($$select activate_phase_draft('bbbbbbbb-0000-0000-0000-000000000002')$$, 'EXIT_CRITERIA_INCOMPLETE');
select throws($$select activate_phase_draft('bbbbbbbb-0000-0000-0000-000000000002','   ')$$, 'EXIT_CRITERIA_INCOMPLETE');
select assert((select phase from programs) = 'Foundation', 'refused activation changed nothing');
select assert((select count(*) from exercises where retired_at is not null) = 0, 'refused activation retired nothing');

-- ------------------------------------------------------ dry run
create temp table dry as select activate_phase_draft('bbbbbbbb-0000-0000-0000-000000000002','Coach override: client ready', true) as r;
select assert((select (r->>'dry_run')::boolean from dry), 'dry run flagged');
select assert((select (r->'changes'->>'kept')::int from dry) = 1, 'dry: 1 kept');
select assert((select jsonb_array_length(r->'changes'->'updated') from dry) = 1, 'dry: 1 updated');
select assert((select jsonb_array_length(r->'changes'->'replaced') from dry) = 1, 'dry: 1 replaced');
select assert((select jsonb_array_length(r->'changes'->'added') from dry) = 1, 'dry: 1 added');
select assert((select jsonb_array_length(r->'changes'->'retired') from dry) = 1, 'dry: 1 retired');
select assert((select count(*) from exercises) = 4, 'dry run inserted nothing');
select assert((select count(*) from exercises where retired_at is not null) = 0, 'dry run retired nothing');
select assert((select phase from programs) = 'Foundation', 'dry run left the phase alone');
select assert((select status from phase_prescription_drafts) = 'draft', 'dry run left the draft a draft');
select assert((select count(*) from phase_transitions) = 0, 'dry run recorded no transition');

-- ------------------------------------------------------ real activation
create temp table act as select activate_phase_draft('bbbbbbbb-0000-0000-0000-000000000002','Coach override: client ready') as r;
select assert((select (r->>'incomplete_exit_criteria')::int from act) = 1, 'override recorded');
select assert((select phase from programs) = 'Strength', 'program moved to the new phase');
select assert((select phase_week_start from programs) = 5, 'phase week range updated');
select assert((select status from phase_prescription_drafts) = 'approved', 'draft approved');
-- unchanged
select assert((select retired_at is null and sets = 4 and name = 'Bench Press' from exercises where id = 'e0000000-0000-0000-0000-000000000002'), 'Bench untouched');
-- updated in place: same row, new sets
select assert((select sets = 4 and retired_at is null from exercises where id = 'e0000000-0000-0000-0000-000000000003'), 'Row updated in place');
-- replaced: old retired (not deleted), new inserted in the same slot
select assert((select retired_at is not null from exercises where id = 'e0000000-0000-0000-0000-000000000001'), 'Goblet retired, not deleted');
select assert((select count(*) from exercises where name = 'Back Squat' and retired_at is null and day_of_week = 'Monday' and group_id = 'g1') = 1, 'Back Squat took the slot incl. group_id');
-- removed
select assert((select retired_at is not null from exercises where id = 'e0000000-0000-0000-0000-000000000004'), 'Plank retired');
-- added
select assert((select count(*) from exercises where name = 'Pull-up' and retired_at is null and group_id is not null) = 1, 'Pull-up added');
-- history intact: every original log still exists
select assert((select count(*) from workout_logs) = 4, 'no workout log was lost');
select assert((select count(*) from workout_logs l join exercises e on e.id = l.exercise_id where e.retired_at is not null) = 2, 'logs of retired exercises still attached');
-- active set = what the draft says
select assert((select count(*) from exercises where retired_at is null) = 4, 'active exercises match the draft');
select assert((select exit_criteria_override and override_note = 'Coach override: client ready' from phase_transitions), 'override stored on the transition');
select assert((select count(*) from program_phase_history) = 1, 'phase history row written');

-- ----------------------------------------------- can't activate twice
select throws($$select activate_phase_draft('bbbbbbbb-0000-0000-0000-000000000002','x')$$, 'already');

-- ------------------------------------------------------------ undo
select undo_phase_transition((select id from phase_transitions), 'testing undo');
select assert((select phase from programs) = 'Foundation', 'undo restored the phase');
select assert((select phase_week_start from programs) = 1, 'undo restored the week range');
select assert((select retired_at is null from exercises where id = 'e0000000-0000-0000-0000-000000000001'), 'Goblet back');
select assert((select retired_at is null from exercises where id = 'e0000000-0000-0000-0000-000000000004'), 'Plank back');
select assert((select sets = 3 from exercises where id = 'e0000000-0000-0000-0000-000000000003'), 'Row sets restored');
select assert((select count(*) from exercises where name in ('Back Squat','Pull-up') and retired_at is null) = 0, 'added/replacement rows retired');
select assert((select count(*) from exercises) = 6, 'nothing deleted by undo (4 original + 2 retired new)');
select assert((select count(*) from exercises where retired_at is null) = 4, 'the original four are active again');
select assert((select status from phase_prescription_drafts) = 'draft', 'draft back to draft');
select assert((select status = 'undone' from phase_transitions), 'transition marked undone');
select throws($$select undo_phase_transition((select id from phase_transitions))$$, 'already undone');

-- --------------------------------------------- empty draft / unnamed row refused
update phase_prescription_drafts set exercises = '[]';
select throws($$select activate_phase_draft('bbbbbbbb-0000-0000-0000-000000000002','x')$$, 'no exercises');
update phase_prescription_drafts set exercises = '[{"name":"  ","sets":3}]';
select throws($$select activate_phase_draft('bbbbbbbb-0000-0000-0000-000000000002','x')$$, 'unnamed');
select assert((select count(*) from exercises where retired_at is null) = 4, 'failed activations changed nothing');

-- ------------------------- undo only for the latest transition + atomic failure
update phase_prescription_drafts set exercises = '[{"name":"Bench Press","day_of_week":"Monday","sets":5,"reps":"5","source_exercise_id":"e0000000-0000-0000-0000-000000000002"},{"name":"Row","day_of_week":"Wednesday","sets":3,"reps":"10","source_exercise_id":"e0000000-0000-0000-0000-000000000003"}]';
select activate_phase_draft('bbbbbbbb-0000-0000-0000-000000000002','override again');
insert into program_phases (id, program_id, client_id, phase, order_index) values ('bbbbbbbb-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','Performance',2);
insert into phase_prescription_drafts (phase_id, program_id, client_id, exercises) values ('bbbbbbbb-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','[{"name":"Bench Press","day_of_week":"Monday","sets":3,"reps":"3","source_exercise_id":"e0000000-0000-0000-0000-000000000002"}]');
select activate_phase_draft('bbbbbbbb-0000-0000-0000-000000000003');  -- Strength has no criteria: no override needed
select throws($$select undo_phase_transition((select id from phase_transitions where to_phase = 'Strength' and status = 'applied'))$$, 'later phase transition');
select assert((select phase from programs) = 'Performance', 'still on the latest phase');
select 'ALL PHASE ACTIVATION TESTS PASSED' as result;
