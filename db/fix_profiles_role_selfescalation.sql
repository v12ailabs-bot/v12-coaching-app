-- Fix: a client could self-promote to coach (or fake their own tier/
-- assessment scores) via a direct Supabase REST call, bypassing the app's UI
-- entirely. Found during the HC-003 (Head Coach authorization) audit:
--
--   create policy profiles_update on profiles for update
--     using (id = auth.uid() or public.is_coach())
--     with check (id = auth.uid() or public.is_coach());
--
-- RLS is row-level, not column-level -- this policy only checks WHOSE row is
-- being updated, never WHICH COLUMNS. Any signed-up client, using their own
-- valid anon-key session (exactly what their browser already holds), could
-- PATCH /rest/v1/profiles?id=eq.<their-own-id> with {"role":"coach"} and it
-- would satisfy id = auth.uid(). After that, is_coach() returns true for
-- them, and every coach-only api/*.js endpoint (requireCoach()) plus every
-- coach-only RLS policy in this schema, including all 5 HC-002 Head Coach
-- tables, would trust them as a real coach. Pre-existing; not introduced by
-- HC-002/HC-003, but it undermines the exact trust chain HC-003 audited.
--
-- Fix: a BEFORE UPDATE trigger (same technique as head_coach_lock_
-- recommendation in db/proposed_head_coach_foundation.sql) blocks changes to
-- role/client_type/the three assessment scores UNLESS the actor is a coach
-- OR there's no user session at all (auth.uid() is null -- i.e. a
-- service-role call from api/*.js, which is already fully trusted; RLS
-- doesn't apply to it regardless). Verified against every existing
-- server-side write to these columns before writing this:
--   - api/_lib/starterActivation.js sets client_type via supabaseAdmin with
--     no user session (payment confirmation) -- allowed, auth.uid() is null.
--   - api/sync-client.js sets the three assessment scores via supabaseAdmin,
--     gated by requireCoach() at the application layer -- allowed, same
--     reason (the DB-level check doesn't need to re-derive this; the
--     service role is already maximally trusted everywhere in this schema).
--   - Coach edits from ClientDetailPage.jsx (saveSettings/saveAssessment)
--     and CRMBoard.jsx go through the browser as the COACH's own session --
--     allowed, is_coach() is true.
--   - Every client-facing self-update (welcome_seen, library_visited_at,
--     height_in, age, sex) never touches these columns -- unaffected.
--
-- Idempotent; safe to re-run, same convention as the rest of db/*.sql.

create or replace function public.profiles_protect_privileged_columns()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and not public.is_coach() then
    if NEW.role is distinct from OLD.role
      or NEW.client_type is distinct from OLD.client_type
      or NEW.nervous_system_recruitment is distinct from OLD.nervous_system_recruitment
      or NEW.muscular_density_to_size is distinct from OLD.muscular_density_to_size
      or NEW.metabolic_work_capacity is distinct from OLD.metabolic_work_capacity
    then
      raise exception 'profiles: role, client_type, and assessment scores can only be changed by a coach or the server';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists profiles_protect_privileged_columns on profiles;
create trigger profiles_protect_privileged_columns
  before update on profiles
  for each row execute function public.profiles_protect_privileged_columns();
