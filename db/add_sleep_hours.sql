-- Sleep: quality (1-10) -> hours. The existing `sleep` column on
-- daily_checkins is a 1-10 self-rated "Sleep Quality" score with real
-- historical data (the old DailyCheckin form's "Sleep Quality" slider, also
-- charted as "Sleep Quality" on Progress) -- NOT destroyed or reinterpreted
-- here. Going forward the client-facing Today screen collects actual hours
-- into this new column via a numeric input. `sleep` becomes legacy/
-- read-only: still rendered for historical dates on Progress, but nothing
-- writes to it once the Today screen ships.
--
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.
alter table daily_checkins add column if not exists sleep_hours numeric;

-- Coach-configurable sleep target (hours) used by the Attention-Needed
-- insight (src/lib/scoring.js assessClientRisk) and surfaced on Client
-- Settings. Defaults to 7h for every existing client.
alter table profiles add column if not exists sleep_target_hours numeric not null default 7;
