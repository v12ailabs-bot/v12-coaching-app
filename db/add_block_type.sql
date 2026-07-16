-- Session-time block grouping for workout logging (Task 10). "block_type" is
-- one of: straight_set (default) | superset | circuit_for_time | timed_circuit
-- | weighted_circuit. "group_id" ties together exercises performed as one
-- block (e.g. a superset's two exercises share a group_id); straight-set
-- exercises get their own unique group_id. Distinct from exercise_type
-- (Compound/Accessory/Circuit/Warmup), which is for strength-progress
-- charting, not session-time logging behavior.
--
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.
alter table exercises
  add column if not exists block_type text not null default 'straight_set',
  add column if not exists group_id text;

-- Rest is logged once per completed round/group (superset, timed circuit,
-- weighted circuit) rather than per exercise. "sets" doubles as the round
-- number for grouped blocks, so no separate round column is needed.
alter table workout_logs
  add column if not exists rest text;
