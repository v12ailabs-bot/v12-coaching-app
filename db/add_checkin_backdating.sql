-- Retroactive/backdated check-ins: a client can log for a past date (daily:
-- up to 7 days back; weekly: the current week or the immediately preceding
-- week — see src/lib/dates.js isWithinBackdateWindow / isWithinWeeklyBackdateWindow).
--
-- `submitted_date` is written client-side via todayStr() at submit time, so
-- it's already the submitter's local calendar date and compares directly
-- against `date` with no UTC conversion -- comparing created_at (a UTC
-- timestamptz) to `date` directly would reproduce the evening-timezone
-- off-by-one bug localDateStr()/todayStr() exist to prevent.
--
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.
alter table daily_checkins add column if not exists submitted_date date;
alter table weekly_checkins add column if not exists submitted_date date;

-- Backfill: historical rows predate backdating even being possible, so
-- same-day submission is correct for all of them.
update daily_checkins set submitted_date = created_at::date where submitted_date is null;
update weekly_checkins set submitted_date = created_at::date where submitted_date is null;
