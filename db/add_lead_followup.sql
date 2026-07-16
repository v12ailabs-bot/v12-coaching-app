-- Follow-up reminders by date on leads (any status, not just Follow-up Later).
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.
alter table leads
  add column if not exists follow_up_date date;
