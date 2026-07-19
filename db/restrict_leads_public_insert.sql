-- The intake form now submits through the rate-limited /api/submit-application
-- route (using the service-role key) instead of inserting directly into
-- `leads` from the browser. Removing the public insert policy closes an open
-- door: previously any caller with the (public) anon key could insert
-- unlimited rows into `leads` directly via the Supabase REST API, with no
-- server-side validation or rate limiting at all.
--
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.
drop policy if exists leads_public_insert on leads;
