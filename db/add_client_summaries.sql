-- AI monthly recaps: one saved recap per client per month, so the coach builds
-- an individual month-to-month history per client (never shared across clients).
-- Only the coach generates them (writes go through the service-role API); the
-- client may read their own.
--
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.
create table if not exists client_summaries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles (id) on delete cascade,
  period text not null,                          -- 'YYYY-MM' the recap was generated in
  content text not null,
  created_at timestamptz not null default now(),
  unique (client_id, period)
);
create index if not exists idx_client_summaries on client_summaries (client_id, period);

alter table client_summaries enable row level security;
-- Client reads their own; coach reads all.
drop policy if exists summaries_select on client_summaries;
create policy summaries_select on client_summaries for select using (client_id = auth.uid() or public.is_coach());
-- Only the coach writes (the API also uses the service-role key).
drop policy if exists summaries_write on client_summaries;
create policy summaries_write on client_summaries for all using (public.is_coach()) with check (public.is_coach());
