-- Phase-scoped program generation + coach-managed exercise-upgrade map.
-- programs.phase/phase_note/phase_updated_at (schema.sql) already track the
-- CURRENT phase label; this adds the week range that phase covers within the
-- program, mirrors it onto program_phase_history for audit, and adds a
-- global (not per-client) exercise_upgrades reference table the "Advance to
-- Next Phase" flow (api/advance-phase.js) consults to swap AI-sourced
-- exercises when a client enters a phase that upgrades them (e.g. Goblet
-- Squat -> Barbell Back Squat entering Intensification).
--
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.

-- programs: the CURRENT phase's week range within the overall program.
alter table programs add column if not exists phase_week_start int;
alter table programs add column if not exists phase_week_end int;

-- program_phase_history: mirror the week range onto each logged change so the
-- audit trail shows what range was active at the time, not just today's.
alter table program_phase_history add column if not exists week_start int;
alter table program_phase_history add column if not exists week_end int;

-- exercise_upgrades: GLOBAL reference data the coach curates once; every
-- client's phase transitions draw from it — NOT a per-client table.
-- base_exercise/upgrade_exercise are matched by name (case-insensitive,
-- trimmed) against a client's existing exercises.name — same matching
-- convention as the locked_exercises_text block in api/generate-program.js.
create table if not exists exercise_upgrades (
  id uuid primary key default gen_random_uuid(),
  base_exercise text not null,
  upgrade_exercise text not null,
  movement_pattern text,
  activates_at_phase text not null,   -- one of PHASES in src/lib/constants.js
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_exercise_upgrades_phase on exercise_upgrades (activates_at_phase);
create index if not exists idx_exercise_upgrades_base on exercise_upgrades (lower(base_exercise));

alter table exercise_upgrades enable row level security;
-- Global reference data: only the coach manages/reads it (same convention as
-- program_templates — clients never need this table).
drop policy if exists exercise_upgrades_select on exercise_upgrades;
create policy exercise_upgrades_select on exercise_upgrades for select using (public.is_coach());
drop policy if exists exercise_upgrades_write on exercise_upgrades;
create policy exercise_upgrades_write on exercise_upgrades for all using (public.is_coach()) with check (public.is_coach());
