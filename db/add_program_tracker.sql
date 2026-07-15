-- Self-guided tracker for program-only clients. They have no coach and no
-- check-ins, so their daily habit checkboxes (water / protein / sleep / workout
-- / steps) and optional body metrics live on their own daily_checkins row:
--   habit_flags — jsonb like {"water":true,"protein":true,...}
--   waist       — waist measurement in inches (weight reuses the existing column)
-- Both are client-writable under the existing daily_checkins RLS.
--
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.
alter table daily_checkins
  add column if not exists habit_flags jsonb,
  add column if not exists waist       numeric;
