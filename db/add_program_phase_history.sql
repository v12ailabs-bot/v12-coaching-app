-- Permanent, append-only log of Program Phase changes. programs.phase/
-- phase_note/phase_updated_at (see schema.sql) stay as the "current phase"
-- fields the rest of the app reads for a quick glance, but every change is
-- now also inserted here so history is never overwritten.
--
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.
create table if not exists program_phase_history (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references programs (id) on delete cascade,
  client_id uuid not null references profiles (id) on delete cascade,
  phase text not null,
  phase_note text,
  changed_by text,
  changed_at timestamptz not null default now()
);
create index if not exists idx_program_phase_history_client on program_phase_history (client_id, changed_at desc);

alter table program_phase_history enable row level security;
-- Client reads their own; coach reads all (same convention as programs/exercises).
drop policy if exists program_phase_history_select on program_phase_history;
create policy program_phase_history_select on program_phase_history for select using (client_id = auth.uid() or public.is_coach());
-- Only the coach writes (append-only — the UI never issues an update/delete against this table).
drop policy if exists program_phase_history_write on program_phase_history;
create policy program_phase_history_write on program_phase_history for all using (public.is_coach()) with check (public.is_coach());
