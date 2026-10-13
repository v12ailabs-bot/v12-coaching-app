-- Coach session reminders: one coach-only note per client ("what to do at the
-- next session"), plus which phase's end-of-phase review the coach has already
-- cleared from the dashboard. COACH-ONLY: the only policy is is_coach(), so a
-- client can never read it through the API. Idempotent; apply in Supabase SQL Editor.
create table if not exists coach_session_reminders (
  client_id uuid primary key references profiles (id) on delete cascade,
  reminder text,
  reviewed_phase text,
  updated_at timestamptz not null default now()
);
alter table coach_session_reminders enable row level security;
drop policy if exists coach_session_reminders_coach on coach_session_reminders;
create policy coach_session_reminders_coach on coach_session_reminders for all using (public.is_coach()) with check (public.is_coach());
