-- Access window: the date a client's access ends. Lets the coach sell
-- time-limited access (e.g. a 12-week program) and have the app enforce it —
-- past this date the client sees an "access ended" screen instead of the portal.
-- Null = unlimited access (all existing clients stay unaffected).
--
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.
alter table profiles add column if not exists access_until date;
