-- Custom workout scheduling (spec Section 11): lets a client (or their
-- coach, for coaching clients) assign which of their existing workout-day
-- groups (exercises.day_of_week — still a weekday label under the hood, but
-- no longer a scheduling constraint once this table exists) happens on a
-- specific real calendar date, instead of being locked to that literal
-- weekday every week. One row per (client_id, date); a null day_of_week is
-- an explicit rest day (distinct from "nothing scheduled yet", which is
-- just no row at all — the app falls back to the legacy weekday auto-match
-- for a client who's never touched the scheduler, so existing programs
-- keep working exactly as they do today).
--
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.
create table if not exists scheduled_workouts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references profiles (id) on delete cascade,
  date date not null,
  day_of_week text,
  created_at timestamptz default now()
);

create unique index if not exists idx_scheduled_workouts_client_date on scheduled_workouts (client_id, date);

alter table scheduled_workouts enable row level security;
drop policy if exists scheduled_workouts_select on scheduled_workouts;
create policy scheduled_workouts_select on scheduled_workouts for select using (client_id = auth.uid() or public.is_coach());
drop policy if exists scheduled_workouts_modify on scheduled_workouts;
create policy scheduled_workouts_modify on scheduled_workouts for all using (client_id = auth.uid() or public.is_coach()) with check (client_id = auth.uid() or public.is_coach());
