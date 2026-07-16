-- Lets a signed-up client read their own lead row (invoice link, paid flag,
-- status) once accept() has linked client_id to their profile. Coach-all and
-- public-insert policies from add_leads_crm.sql are unaffected -- this only
-- adds read access scoped to the client's own row.
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.
drop policy if exists leads_client_own_select on leads;
create policy leads_client_own_select on leads for select using (client_id = auth.uid());
