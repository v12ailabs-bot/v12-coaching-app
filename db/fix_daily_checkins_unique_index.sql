-- Program-only clients' body-metrics/habit save started failing with
-- "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification" once errors stopped being swallowed silently. The upsert
-- targets ON CONFLICT (client_id, date), but daily_checkins never actually
-- had a unique index on those columns in production -- schema.sql documents
-- one (in the original CREATE TABLE), but like habit_flags/waist before it,
-- that appears to have never been applied to the live table.
--
-- If duplicate (client_id, date) rows already exist (nothing was enforcing
-- uniqueness), keep only the most recently created row per pair so the
-- index can be created.
--
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.
delete from daily_checkins a using daily_checkins b
where a.client_id = b.client_id and a.date = b.date and a.id < b.id;

create unique index if not exists daily_checkins_client_id_date_idx
  on daily_checkins (client_id, date);
