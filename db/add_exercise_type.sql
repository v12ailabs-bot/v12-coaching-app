-- Explicit strength-progress type for an exercise: "Compound", "Accessory",
-- "Circuit", or "Warmup". Drives the grouping (and warm-up exclusion) in the
-- Progress → Strength tab. Nullable/blank = the app auto-detects the group from
-- the exercise's free-text section/category/name instead.
--
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.
alter table exercises
  add column if not exists exercise_type text;
