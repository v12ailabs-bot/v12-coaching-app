-- The date a program actually began, so "Week X of Y" on the client dashboard
-- can be computed from a real date instead of created_at (which doesn't move
-- when the coach edits the program later). Nullable: until the coach sets it,
-- the dashboard shows the phase without a week count rather than guessing.
--
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.
alter table programs add column if not exists start_date date;
