-- Client-visible coach message: a single free-text field the coach writes and
-- the CLIENT sees in their portal (top of the Dashboard and Training Plan).
--
-- Deliberately separate from the private `coach_notes` table (coach-only): this
-- one field is meant to be shown to the client. Nullable/blank = nothing shown.
--
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.
alter table profiles
  add column if not exists coach_message text;
