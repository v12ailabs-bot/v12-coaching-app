-- Self-reported nutrition on the daily check-in: calories and macros the client
-- actually hit that day. Nullable/blank = not reported. Complements the existing
-- qualitative `diet` field ("On track", etc).
--
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.
alter table daily_checkins
  add column if not exists calories  numeric,
  add column if not exists protein_g numeric,
  add column if not exists carbs_g   numeric,
  add column if not exists fats_g     numeric;
