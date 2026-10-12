-- Local test for db/add_prescribed_weight.sql (+ add_progression_engine.sql).
-- Run via scripts/test-progression-decision.sh (throwaway Postgres in Docker).
\set ON_ERROR_STOP on
create role authenticated; create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create table profiles (id uuid primary key, role text default 'client');
create function public.is_coach() returns boolean language sql stable security definer as $$ select exists (select 1 from profiles where id = auth.uid() and role='coach') $$;
create table exercises (id uuid primary key default gen_random_uuid(), client_id uuid references profiles(id) on delete cascade, name text not null, day_of_week text);
create table workout_logs (id uuid primary key default gen_random_uuid(), client_id uuid, exercise_id uuid references exercises(id) on delete cascade, date date, sets int, reps int, weight numeric);
grant usage on schema public, auth to authenticated;
\i /work/db/add_progression_engine.sql
\i /work/db/add_prescribed_weight.sql
\i /work/db/add_prescribed_weight.sql
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

insert into profiles values ('00000000-0000-0000-0000-0000000000c0','coach'), ('00000000-0000-0000-0000-00000000000a','client');
insert into exercises (id, client_id, name) values ('e0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','Bench'), ('e0000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000a','Squat');
insert into progression_recommendations (id, client_id, exercise_id, method_id, session_date, calc_input, calc_result, recommended_load) values
 ('a0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','e0000000-0000-0000-0000-000000000001','double_progression','2026-10-01','{}','{"status":"increase","recommendedLoad":105}',105),
 ('a0000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000a','e0000000-0000-0000-0000-000000000002','double_progression','2026-10-01','{}','{"status":"hold"}',null),
 ('a0000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-00000000000a','e0000000-0000-0000-0000-000000000001','double_progression','2026-10-08','{}','{"status":"increase","recommendedLoad":110}',110);

-- client: refused everywhere
set test.uid = '00000000-0000-0000-0000-00000000000a';
select throws($$select decide_progression_recommendation('a0000000-0000-0000-0000-000000000001','approve')$$, 'Only a coach');
select throws($$update exercises set prescribed_weight = 999 where id = 'e0000000-0000-0000-0000-000000000001'$$, 'Only a coach');
-- clients can still update the rest of their own row (rescheduling)
update exercises set day_of_week = 'Friday' where id = 'e0000000-0000-0000-0000-000000000001';
select assert((select day_of_week from exercises where id = 'e0000000-0000-0000-0000-000000000001') = 'Friday', 'client can still reschedule');

set test.uid = '00000000-0000-0000-0000-0000000000c0';
-- approve writes the load to the exercise AND the decision, together
select decide_progression_recommendation('a0000000-0000-0000-0000-000000000001','approve', null, 'looks good');
select assert((select prescribed_weight from exercises where id = 'e0000000-0000-0000-0000-000000000001') = 105, 'approved load reached the exercise');
select assert((select prescribed_recommendation_id from exercises where id = 'e0000000-0000-0000-0000-000000000001') = 'a0000000-0000-0000-0000-000000000001', 'exercise points at the recommendation');
select assert((select prescribed_set_at is not null from exercises where id = 'e0000000-0000-0000-0000-000000000001'), 'timestamp set');
select assert((select status = 'approved' and approved_prescription->>'source' = 'calculated' and decision_note = 'looks good' and decided_by is not null from progression_recommendations where id = 'a0000000-0000-0000-0000-000000000001'), 'decision recorded');
-- the frozen calculation is untouched
select assert((select recommended_load = 105 and calc_result->>'status' = 'increase' from progression_recommendations where id = 'a0000000-0000-0000-0000-000000000001'), 'original calc intact');
-- already decided
select throws($$select decide_progression_recommendation('a0000000-0000-0000-0000-000000000001','reject')$$, 'already approved');
-- cannot approve a recommendation with no calculated load; nothing changes
select throws($$select decide_progression_recommendation('a0000000-0000-0000-0000-000000000002','approve')$$, 'no calculated load');
select assert((select prescribed_weight is null from exercises where id = 'e0000000-0000-0000-0000-000000000002'), 'failed approve wrote nothing');
select assert((select status = 'pending' from progression_recommendations where id = 'a0000000-0000-0000-0000-000000000002'), 'failed approve left it pending');
-- modify: override stored separately, original kept
select throws($$select decide_progression_recommendation('a0000000-0000-0000-0000-000000000002','modify')$$, 'positive load');
select throws($$select decide_progression_recommendation('a0000000-0000-0000-0000-000000000002','modify', -5)$$, 'positive load');
select decide_progression_recommendation('a0000000-0000-0000-0000-000000000003','modify', 107.5);
select assert((select prescribed_weight = 107.5 from exercises where id = 'e0000000-0000-0000-0000-000000000001'), 'override reached the exercise (replacing the earlier target)');
select assert((select approved_prescription->>'source' = 'coach_override' and (approved_prescription->>'calculatedLoad')::numeric = 110 and recommended_load = 110 from progression_recommendations where id = 'a0000000-0000-0000-0000-000000000003'), 'override stored beside the untouched calculation');
-- reject touches nothing
select decide_progression_recommendation('a0000000-0000-0000-0000-000000000002','reject');
select assert((select prescribed_weight is null from exercises where id = 'e0000000-0000-0000-0000-000000000002'), 'reject wrote no target');
select throws($$select decide_progression_recommendation('a0000000-0000-0000-0000-000000000002','yolo')$$, 'decision must be');
select throws($$select decide_progression_recommendation(gen_random_uuid(),'approve')$$, 'not found');
-- coach can clear a target; constraint rejects non-positive
update exercises set prescribed_weight = null where id = 'e0000000-0000-0000-0000-000000000001';
select assert((select prescribed_weight is null from exercises where id = 'e0000000-0000-0000-0000-000000000001'), 'coach can clear the target');
select throws($$update exercises set prescribed_weight = 0 where id = 'e0000000-0000-0000-0000-000000000001'$$, 'exercises_prescribed_weight_check');
-- the original calc is still immutable
select throws($$update progression_recommendations set recommended_load = 1 where id = 'a0000000-0000-0000-0000-000000000003'$$, 'immutable');
select 'ALL PROGRESSION DECISION TESTS PASSED' as result;
