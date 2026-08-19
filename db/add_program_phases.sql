-- Coach-planned phase sequence for a program's roadmap (e.g. Assessment ->
-- Phase 1 -> Phase 2 -> Phase 3 -> Maintenance). Distinct from
-- program_phase_history (schema.sql / add_program_phase_history.sql), which is
-- an append-only LOG of phase changes that already happened — this table is
-- the coach's forward-looking PLAN, freely editable, and it's what the
-- ProgramRoadmap component reads to render completed/current/upcoming phases.
-- programs.phase (unchanged) stays the single source of truth for which
-- phase is CURRENT — a row here is "current" when its `phase` text matches
-- programs.phase, "completed" when it's earlier in order_index, "upcoming"
-- otherwise. Per-client/program, so different clients can have entirely
-- different phase sequences.
--
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.
create table if not exists program_phases (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs (id) on delete cascade,
  client_id uuid not null references profiles (id) on delete cascade,
  phase text not null,
  order_index int not null default 0,
  week_start int,
  week_end int,
  created_at timestamptz not null default now()
);
create index if not exists idx_program_phases_program on program_phases (program_id, order_index);

alter table program_phases enable row level security;
-- Client reads their own; coach reads all (same convention as program_phase_history).
drop policy if exists program_phases_select on program_phases;
create policy program_phases_select on program_phases for select using (client_id = auth.uid() or public.is_coach());
-- Coach-only write: the plan is edited as a whole (replace-all-rows), not appended to.
drop policy if exists program_phases_write on program_phases;
create policy program_phases_write on program_phases for all using (public.is_coach()) with check (public.is_coach());
