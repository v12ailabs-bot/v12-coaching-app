-- 12-week plan, slice 3: per-phase workout DRAFTS. A draft is a proposed
-- exercise list for a future phase, built from the program's current exercises
-- plus that phase's planned changes. It is NOT active: nothing here touches
-- exercises (the client's real workouts) or workout_logs. Idempotent; additive;
-- safe to re-run. Apply via the Supabase SQL Editor.
--
-- Coach-only (RLS): a draft is speculative future programming, which the
-- client must not be able to read through the API.
create table if not exists phase_prescription_drafts (
  phase_id uuid primary key references program_phases (id) on delete cascade,
  program_id uuid not null references programs (id) on delete cascade,
  client_id uuid not null references profiles (id) on delete cascade,
  exercises jsonb not null default '[]',
  unapplied jsonb not null default '[]',          -- planned changes that couldn't be applied, with the reason
  status text not null default 'draft' check (status in ('draft', 'approved', 'superseded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table phase_prescription_drafts enable row level security;
drop policy if exists phase_prescription_drafts_coach on phase_prescription_drafts;
create policy phase_prescription_drafts_coach on phase_prescription_drafts for all using (public.is_coach()) with check (public.is_coach());
