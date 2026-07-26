-- Lets a client acknowledge an AI monthly recap (client_summaries), the same
-- read-state pattern coach_messages/client_goal_insights already use, so a
-- newly generated recap can surface once on the client's Home page (a "Got
-- it"-style banner) instead of sitting silently in the always-collapsed
-- Progress list until the client thinks to open it.
--
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.
alter table client_summaries add column if not exists acknowledged_at timestamptz;

-- Client acknowledges their own recap (sets acknowledged_at); the coach's
-- existing "for all" policy (summaries_write) already covers coach writes.
drop policy if exists summaries_ack on client_summaries;
create policy summaries_ack on client_summaries for update
  using (client_id = auth.uid() or public.is_coach())
  with check (client_id = auth.uid() or public.is_coach());
