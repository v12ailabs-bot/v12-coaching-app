-- Lets a client acknowledge a coaching insight (client_goal_insights), the
-- same read-state pattern coach_messages already uses, so a newly generated
-- insight can surface once on the client's Home page (a "Got it" banner)
-- instead of being coach-only (previously only GoalsSection, inside the
-- coach's ClientDetailPage, ever read this table — no policy let the client
-- write to it at all).
--
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.
alter table client_goal_insights add column if not exists acknowledged_at timestamptz;

-- Client acknowledges their own insights (sets acknowledged_at); the coach's
-- existing "for all" policy already covers coach writes.
drop policy if exists goal_insights_ack on client_goal_insights;
create policy goal_insights_ack on client_goal_insights for update
  using (client_id = auth.uid() or public.is_coach())
  with check (client_id = auth.uid() or public.is_coach());
