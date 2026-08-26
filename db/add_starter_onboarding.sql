-- Starter onboarding checklist (spec Section 14): tracks the one step that
-- isn't otherwise derivable from existing data -- "visited the Library" --
-- as a real timestamp, not a fabricated flag. "Set a schedule" is derived
-- from scheduled_workouts having a row; "pick a workout" isn't trackable
-- yet (see the Starter content library, still pending the Notion DB).
--
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.
alter table profiles add column if not exists library_visited_at timestamptz;
