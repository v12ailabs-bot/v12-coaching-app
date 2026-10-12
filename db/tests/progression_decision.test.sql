-- Local test for db/add_prescribed_weight.sql (+ add_progression_engine.sql).
-- Run via scripts/test-progression-decision.sh (throwaway Postgres in Docker).
\set ON_ERROR_STOP on
create role authenticated; create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create table profiles (id uuid primary key, role text default 'client');
create function public.is_coach() returns boolean language sql stable security definer as $$ select exists (select 1 from profiles where id = auth.uid() and role='coach') $$;
create table programs (id uuid primary key default gen_random_uuid());
create table exercises (id uuid primary key default gen_random_uuid(), client_id uuid references profiles(id) on delete cascade, name text not null, day_of_week text);
create table workout_logs (id uuid primary key default gen_random_uuid(), client_id uuid, exercise_id uuid references exercises(id) on delete cascade, date date, sets int, reps int, weight numeric);
grant usage on schema public, auth to authenticated;
\i /work/db/add_progression_engine.sql
\i /work/db/add_prescribed_weight.sql
\i /work/db/add_prescribed_weight.sql
\i /work/db/add_density_taper.sql
\i /work/db/add_density_taper.sql
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

-- ============================ density (non-load) recommendations ============================
set test.uid = '00000000-0000-0000-0000-0000000000c0';
update exercises set progression_config = '{"mode":"fixed_time","targetWork":40}' where id = 'e0000000-0000-0000-0000-000000000002';
insert into progression_recommendations (id, client_id, exercise_id, method_id, session_date, calc_input, calc_result, recommended_load) values
 ('d0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','e0000000-0000-0000-0000-000000000002','density_progression','2026-10-01','{}',
  '{"status":"progress","calc":{"nonLoad":true},"proposedAdjustment":{"type":"increase_target_work","from":40,"to":48,"configPatch":{"targetWork":48}}}', null),
 ('d0000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000a','e0000000-0000-0000-0000-000000000002','density_progression','2026-10-08','{}',
  '{"status":"regression","calc":{"nonLoad":true},"proposedAdjustment":null}', null),
 ('d0000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-00000000000a','e0000000-0000-0000-0000-000000000002','density_progression','2026-10-15','{}',
  '{"status":"progress","calc":{"nonLoad":true},"proposedAdjustment":{"configPatch":{"targetWork":50}}}', null);
set test.uid = '00000000-0000-0000-0000-00000000000a';
select throws($$select decide_progression_recommendation('d0000000-0000-0000-0000-000000000001','approve')$$, 'Only a coach');
set test.uid = '00000000-0000-0000-0000-0000000000c0';
-- modify is for loads only; nothing changes
select throws($$select decide_progression_recommendation('d0000000-0000-0000-0000-000000000001','modify', 50)$$, 'load recommendations only');
select assert((select status = 'pending' from progression_recommendations where id = 'd0000000-0000-0000-0000-000000000001'), 'refused modify left it pending');
-- approve applies the new target to the exercise config (merged, other keys kept) and records the decision
select decide_progression_recommendation('d0000000-0000-0000-0000-000000000001','approve', null, 'ok');
select assert((select (progression_config->>'targetWork')::int = 48 and progression_config->>'mode' = 'fixed_time' from exercises where id = 'e0000000-0000-0000-0000-000000000002'), 'target patched, mode kept');
select assert((select status = 'approved' and approved_prescription->>'source' = 'calculated' and (approved_prescription->'adjustment'->>'to')::int = 48 from progression_recommendations where id = 'd0000000-0000-0000-0000-000000000001'), 'decision + adjustment recorded');
select assert((select prescribed_weight is null from exercises where id = 'e0000000-0000-0000-0000-000000000002'), 'density approval never writes a load');
select assert((select calc_result->'proposedAdjustment'->'configPatch'->>'targetWork' = '48' from progression_recommendations where id = 'd0000000-0000-0000-0000-000000000001'), 'original calculation untouched');
-- a regression is acknowledged, nothing applied
select decide_progression_recommendation('d0000000-0000-0000-0000-000000000002','approve');
select assert((select approved_prescription->>'acknowledged' = 'true' from progression_recommendations where id = 'd0000000-0000-0000-0000-000000000002'), 'regression acknowledged');
select assert((select (progression_config->>'targetWork')::int = 48 from exercises where id = 'e0000000-0000-0000-0000-000000000002'), 'acknowledging changed no target');
-- reject applies nothing
select decide_progression_recommendation('d0000000-0000-0000-0000-000000000003','reject');
select assert((select (progression_config->>'targetWork')::int = 48 from exercises where id = 'e0000000-0000-0000-0000-000000000002'), 'reject changed no target');
select throws($$select decide_progression_recommendation('d0000000-0000-0000-0000-000000000001','approve')$$, 'already approved');

-- ============================ taper plans ============================
insert into taper_plans (id, client_id, name, event_date, config, calculated, current_plan, created_by)
values ('b0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','Meet taper','2026-10-10','{"reductionPct":40}','{"plannedVolume":13}','{"plannedVolume":13}','00000000-0000-0000-0000-0000000000c0');
set role authenticated;  -- from here RLS applies (the setup above ran as the table owner)
set test.uid = '00000000-0000-0000-0000-00000000000a';
select assert((select count(*) from taper_plans) = 0, 'clients cannot read taper plans');
select throws($$insert into taper_plans (client_id, name, event_date, config, calculated, current_plan) values ('00000000-0000-0000-0000-00000000000a','x','2026-10-10','{}','{}','{}')$$, 'row-level security');
set test.uid = '00000000-0000-0000-0000-0000000000c0';
-- status + current plan + a log entry are allowed
update taper_plans set status = 'active', current_plan = '{"plannedVolume":11}', override_log = '[{"note":"first"}]' where id = 'b0000000-0000-0000-0000-000000000001';
select assert((select status = 'active' and (current_plan->>'plannedVolume')::int = 11 from taper_plans), 'coach can override the in-force plan');
update taper_plans set override_log = override_log || '[{"note":"second"}]'::jsonb where id = 'b0000000-0000-0000-0000-000000000001';
select assert((select jsonb_array_length(override_log) = 2 from taper_plans), 'log appended');
-- the original plan and the log history cannot be rewritten
select throws($$update taper_plans set calculated = '{"plannedVolume":1}'$$, 'immutable');
select throws($$update taper_plans set config = '{"reductionPct":10}'$$, 'immutable');
select throws($$update taper_plans set event_date = '2026-11-01'$$, 'immutable');
select throws($$update taper_plans set override_log = '[{"note":"first"}]'$$, 'append-only');
select throws($$update taper_plans set override_log = '[{"note":"EDITED"},{"note":"second"}]'$$, 'append-only');
select throws($$update taper_plans set override_log = '{}'$$, 'append-only');
select assert((select (calculated->>'plannedVolume')::int = 13 and (config->>'reductionPct')::int = 40 from taper_plans), 'original plan intact');
-- no deleting audit history
delete from taper_plans where id = 'b0000000-0000-0000-0000-000000000001';
select assert((select count(*) from taper_plans) = 1, 'the app cannot delete a taper plan');
reset role;
select 'ALL PROGRESSION DECISION + DENSITY/TAPER TESTS PASSED' as result;
