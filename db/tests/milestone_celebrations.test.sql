-- Local test for db/add_milestone_celebrations.sql. Run via scripts/test-milestone-celebrations.sh
\set ON_ERROR_STOP on
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create table profiles (id uuid primary key, role text default 'client');
create function public.is_coach() returns boolean language sql stable security definer as $$ select exists (select 1 from profiles where id = auth.uid() and role='coach') $$;
create function public.strength_exercise_key(p_name text) returns text language sql immutable as $$ select lower(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g')) $$;
create table exercises (id uuid primary key default gen_random_uuid(), client_id uuid references profiles(id), name text not null);
create table workout_logs (id uuid primary key default gen_random_uuid(), client_id uuid references profiles(id), exercise_id uuid references exercises(id) on delete cascade, date date, sets int, reps int, weight numeric, set_type text not null default 'working');
create table daily_checkins (id uuid primary key default gen_random_uuid(), client_id uuid references profiles(id), date date, weight numeric);
create table client_goals (id uuid primary key default gen_random_uuid(), client_id uuid references profiles(id), goal_type text, metric_key text, category text, exercise_name text,
  direction text, unit text, baseline_value numeric, baseline_date date, target_value numeric, status text default 'active', achieved_at timestamptz, coach_acknowledged_at timestamptz);
grant select, update on client_goals to authenticated;

insert into profiles (id, role) values ('00000000-0000-0000-0000-0000000000a1','client'), ('00000000-0000-0000-0000-0000000000a2','client');
insert into exercises (id, client_id, name) values ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','Back  Squat');
insert into client_goals (id, client_id, metric_key, category, exercise_name, direction, unit, baseline_value, baseline_date, target_value, achieved_at) values
 ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','exercise:back squat','strength','back squat','increase','lb',225,'2026-09-01',325,null),
 ('30000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000a1','bodyweight',null,null,'decrease','lb',200,'2026-09-01',185,null),
 ('30000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-0000000000a2','exercise:old','strength','old','increase','lb',100,'2026-01-01',150,now());   -- hit BEFORE the migration

\i /work/db/add_milestone_celebrations.sql
\i /work/db/add_milestone_celebrations.sql
create function assert(cond boolean, msg text) returns void language plpgsql as $$ begin if cond is not true then raise exception 'ASSERT FAILED: %', msg; end if; end $$;
create function hit(p_id text) returns boolean language sql as $$ select achieved_at is not null from client_goals where client_goals.id = p_id::uuid $$;
create function a1() returns text language sql as $$ select '00000000-0000-0000-0000-0000000000a1' $$;

-- pre-existing hits don't pop up for the client
select assert((select client_acknowledged_at is not null from client_goals where id = '30000000-0000-0000-0000-000000000003'), 'historic hit pre-acknowledged');

-- warm-up and short-of-target sets do not hit; before-baseline sets do not hit
insert into workout_logs (client_id, exercise_id, date, reps, weight, set_type) values (a1()::uuid,'20000000-0000-0000-0000-000000000001','2026-09-10',3,335,'warmup');
insert into workout_logs (client_id, exercise_id, date, reps, weight) values (a1()::uuid,'20000000-0000-0000-0000-000000000001','2026-09-10',3,315);
insert into workout_logs (client_id, exercise_id, date, reps, weight) values (a1()::uuid,'20000000-0000-0000-0000-000000000001','2026-08-01',3,400);
select assert(not hit('30000000-0000-0000-0000-000000000001'), 'no false hit');
-- a working set at/over the target hits (name matched despite spacing/case)
insert into workout_logs (client_id, exercise_id, date, reps, weight) values (a1()::uuid,'20000000-0000-0000-0000-000000000001','2026-09-20',2,325);
select assert(hit('30000000-0000-0000-0000-000000000001'), 'squat milestone hit');
select assert((select client_acknowledged_at is null from client_goals where id = '30000000-0000-0000-0000-000000000001'), 'new hit is unacknowledged');

-- weight goal (decrease): above target no, at/below target yes
insert into daily_checkins (client_id, date, weight) values (a1()::uuid,'2026-09-10',190);
select assert(not hit('30000000-0000-0000-0000-000000000002'), 'not yet');
insert into daily_checkins (client_id, date, weight) values (a1()::uuid,'2026-09-20',184.6);
select assert(hit('30000000-0000-0000-0000-000000000002'), 'weight goal hit');

-- a client can acknowledge their own, not someone else's
set role authenticated; set test.uid = '00000000-0000-0000-0000-0000000000a2';
select acknowledge_my_achievements(array['30000000-0000-0000-0000-000000000001']::uuid[]);
reset role;
select assert((select client_acknowledged_at is null from client_goals where id = '30000000-0000-0000-0000-000000000001'), 'other client cannot acknowledge');
set role authenticated; set test.uid = '00000000-0000-0000-0000-0000000000a1';
select acknowledge_my_achievements(array['30000000-0000-0000-0000-000000000001']::uuid[]);
reset role;
select assert((select client_acknowledged_at is not null from client_goals where id = '30000000-0000-0000-0000-000000000001'), 'own acknowledged');
\echo milestone celebrations: all assertions passed
