-- Coach "Today" schedule: sessions the coach has with a client. One table for
-- both shapes: a one-off (session_date set) or recurring (weekdays set, e.g.
-- {1,3,5} = Mon/Wed/Fri, 0 = Sunday). Coach-only (is_coach()). Idempotent;
-- apply in the Supabase SQL Editor.
create table if not exists coach_sessions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles (id) on delete cascade,
  start_time time not null,
  session_type text,
  session_date date,
  weekdays smallint[],
  created_at timestamptz not null default now(),
  constraint coach_sessions_when check ((session_date is not null) <> (weekdays is not null and cardinality(weekdays) > 0))
);
create index if not exists coach_sessions_client_idx on coach_sessions (client_id);
alter table coach_sessions enable row level security;
drop policy if exists coach_sessions_coach on coach_sessions;
create policy coach_sessions_coach on coach_sessions for all using (public.is_coach()) with check (public.is_coach());
