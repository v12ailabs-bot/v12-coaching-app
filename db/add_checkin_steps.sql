-- Steps as an actual numeric check-in value (not the program-only client's
-- boolean habit_flags.steps checkbox, which is a separate self-guided
-- system left untouched). Needed by the Today screen: a client may have a
-- step-count target (via a manual_value habit) but still needs to enter
-- what they actually did, independent of whether they hit the target.
--
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.
alter table daily_checkins add column if not exists steps numeric;
