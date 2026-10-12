-- Slice 4 groundwork: a way to retire an exercise WITHOUT deleting it.
-- exercises -> workout_logs is ON DELETE CASCADE, so deleting an exercise
-- destroys its logged history. A retired exercise disappears from the client's
-- current workouts but stays in the table so past logs, strength charts and
-- milestones keep working. Nothing sets retired_at yet (that is the later
-- phase-transition step), so this migration changes no behaviour on its own.
-- Idempotent; additive; safe to re-run. Apply via the Supabase SQL Editor.
--
-- IMPORTANT: run this BEFORE deploying the code that filters on retired_at —
-- those queries fail if the column doesn't exist.
alter table exercises add column if not exists retired_at timestamptz;
alter table exercises add column if not exists retired_reason text;
create index if not exists idx_exercises_active on exercises (client_id) where retired_at is null;
