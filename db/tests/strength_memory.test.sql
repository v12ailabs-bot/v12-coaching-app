-- Local test for db/add_strength_memory.sql. Run via scripts/test-strength-memory.sh
-- (throwaway Postgres in Docker; never touches Supabase).
\set ON_ERROR_STOP on
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create table profiles (id uuid primary key, role text default 'client');
create function public.is_coach() returns boolean language sql stable security definer as $$ select exists (select 1 from profiles where id = auth.uid() and role='coach') $$;
create table exercises (id uuid primary key default gen_random_uuid(), client_id uuid references profiles(id) on delete cascade, name text not null, is_bodyweight boolean default false);
create table workout_logs (id uuid primary key default gen_random_uuid(), client_id uuid references profiles(id), exercise_id uuid not null references exercises(id) on delete cascade,
  date date, sets int, reps int, weight numeric, set_type text not null default 'working', created_at timestamptz default now());

insert into profiles (id, role) values ('00000000-0000-0000-0000-0000000000a1','client');
insert into exercises (id, client_id, name) values ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','Back  Squat ');
-- History that exists BEFORE the migration (exercises the backfill must pick up).
insert into workout_logs (client_id, exercise_id, date, sets, reps, weight) values
 ('00000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-000000000001','2026-09-01',1,5,200),
 ('00000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-000000000001','2026-09-08',1,5,215);

\i /work/db/add_strength_memory.sql
\i /work/db/add_strength_memory.sql

create function assert(cond boolean, msg text) returns void language plpgsql as $$ begin if cond is not true then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

-- Backfill: key is normalised, best/last come from the history.
select assert((select count(*) from client_strength_records) = 1, 'backfill creates one record');
select assert((select exercise_key from client_strength_records) = 'back squat', 'name normalised');
select assert((select best_weight from client_strength_records) = 215 and (select last_date from client_strength_records) = '2026-09-08', 'backfill best/last');

-- Trigger: heavier set moves best; warm-ups ignored; lighter later set moves last but not best.
insert into workout_logs (client_id, exercise_id, date, sets, reps, weight) values ('00000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-000000000001','2026-09-15',1,3,225);
insert into workout_logs (client_id, exercise_id, date, sets, reps, weight, set_type) values ('00000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-000000000001','2026-09-15',0,5,400,'warmup');
select assert((select best_weight from client_strength_records) = 225 and (select best_weight_reps from client_strength_records) = 3, 'heavier set is the best; warm-up ignored');
insert into workout_logs (client_id, exercise_id, date, sets, reps, weight) values ('00000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-000000000001','2026-09-22',1,8,185);
select assert((select best_weight from client_strength_records) = 225 and (select last_weight from client_strength_records) = 185, 'lighter newer session sets last, keeps best');
-- Same-day lighter set after a heavier one does not replace the day's top set.
insert into workout_logs (client_id, exercise_id, date, sets, reps, weight) values ('00000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-000000000001','2026-09-22',2,8,135);
select assert((select last_weight from client_strength_records) = 185, 'same day keeps the top set');
select assert((select best_reps from client_strength_records) = 8, 'best reps');

-- The point of the feature: deleting the exercise cascades its logs but the memory stays.
delete from exercises where id = '20000000-0000-0000-0000-000000000001';
select assert((select count(*) from workout_logs) = 0, 'logs cascade-deleted');
select assert((select best_weight from client_strength_records) = 225 and (select exercise_name from client_strength_records) = 'Back  Squat', 'record survives the delete');

-- Same movement re-added under a new exercise row keeps feeding the same record.
insert into exercises (id, client_id, name) values ('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000a1','back squat');
insert into workout_logs (client_id, exercise_id, date, sets, reps, weight) values ('00000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-000000000002','2026-10-01',1,5,230);
select assert((select count(*) from client_strength_records) = 1 and (select best_weight from client_strength_records) = 230, 'new exercise row, same record');

-- RLS: a client reads only their own.
insert into profiles (id) values ('00000000-0000-0000-0000-0000000000a2');
grant select on client_strength_records to authenticated;
set role authenticated; set test.uid = '00000000-0000-0000-0000-0000000000a2';
select assert((select count(*) from client_strength_records) = 0, 'other client sees nothing');
set test.uid = '00000000-0000-0000-0000-0000000000a1';
select assert((select count(*) from client_strength_records) = 1, 'client sees own');
\echo strength memory: all assertions passed
