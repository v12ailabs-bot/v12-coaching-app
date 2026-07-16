-- Business + Content metrics (Task 5). Daily entries roll up into a weekly
-- view in-app. Explicitly excludes Fitness/Discipline. Not synced from Notion
-- (matches the CRM's one-time-backfill, no-live-sync approach) -- coach enters
-- these directly each day.
--
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.
create table if not exists daily_metrics (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  dms_sent int not null default 0,
  sales_conversations int not null default 0,
  calls_booked int not null default 0,
  clients_closed int not null default 0,
  active_clients int,
  revenue_today numeric(10,2) not null default 0,
  content_posted boolean not null default false,
  content_created boolean not null default false,
  content_recorded boolean not null default false,
  created_at timestamptz not null default now()
);

alter table daily_metrics enable row level security;
drop policy if exists daily_metrics_coach_all on daily_metrics;
create policy daily_metrics_coach_all on daily_metrics for all using (public.is_coach()) with check (public.is_coach());
