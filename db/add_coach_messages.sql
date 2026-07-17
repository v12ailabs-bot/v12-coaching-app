-- Real coach -> client messaging with history and read-state. Replaces the
-- single overwritable `profiles.coach_message` field: each save used to wipe
-- out the previous message with no record of it, and the client had no way
-- to acknowledge/dismiss it (it just showed forever, unconditionally).
--
-- profiles.coach_message is left in place (not dropped) — harmless once the
-- app stops reading from it — but the backfill below copies its current
-- value into this table as message #1 so nothing is lost in the switchover.
--
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.
create table if not exists coach_messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz
);
create index if not exists idx_coach_messages_client on coach_messages (client_id, created_at desc);

alter table coach_messages enable row level security;

drop policy if exists coach_messages_select on coach_messages;
create policy coach_messages_select on coach_messages for select using (client_id = auth.uid() or public.is_coach());

drop policy if exists coach_messages_insert on coach_messages;
create policy coach_messages_insert on coach_messages for insert with check (public.is_coach());

-- Client acknowledges their own messages (sets acknowledged_at); coach can
-- also update/delete (e.g. correcting a typo, retracting a message).
drop policy if exists coach_messages_update on coach_messages;
create policy coach_messages_update on coach_messages for update
  using (client_id = auth.uid() or public.is_coach())
  with check (client_id = auth.uid() or public.is_coach());

drop policy if exists coach_messages_delete on coach_messages;
create policy coach_messages_delete on coach_messages for delete using (public.is_coach());

-- One-time backfill: copy any existing coach_message value into history as
-- message #1, only for clients who don't already have a row (so re-running
-- this file is a no-op after the first successful pass).
insert into coach_messages (client_id, body, created_at)
select p.id, p.coach_message, now()
from profiles p
where p.coach_message is not null
  and trim(p.coach_message) <> ''
  and not exists (select 1 from coach_messages cm where cm.client_id = p.id);
