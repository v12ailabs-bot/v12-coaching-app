-- V12 progression system: a small, coach-editable toolkit of named
-- progression models (conjugate, APRE, percentage-based, double progression,
-- density progression, performance taper), a two-level nested phase model
-- (top_phase: Foundation/Accumulation/Performance, each with its own
-- foundation/accumulation/intensification/performance/deload sub_phase),
-- replacing the old flat program.phase picker. program.phase/phase_note stay
-- in place — the coach's new picker keeps writing a synthesized display
-- string into them so every existing reader (PhaseAlertsPanel, CoachHome,
-- AIRecommendationCard's roadmap matching, ClientHero, ProgramRoadmapCard,
-- etc.) keeps working unchanged. See src/lib/progressionModels.js.

do $$ begin
  if not exists (select 1 from pg_type where typname = 'progression_top_phase') then
    create type progression_top_phase as enum ('foundation','accumulation','performance');
  end if;
  if not exists (select 1 from pg_type where typname = 'program_sub_phase') then
    create type program_sub_phase as enum ('foundation','accumulation','intensification','performance','deload');
  end if;
end $$;

create table if not exists progression_models (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  label text not null,
  top_phase progression_top_phase not null,
  pillar_lean text,              -- 'powerlifting' | 'bodybuilding' | 'conditioning' | 'blend' — informational only
  methodology text not null,     -- fed verbatim into the AI prompt as this model's instructions
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_progression_models_top_phase on progression_models (top_phase) where is_active;

alter table progression_models enable row level security;
drop policy if exists progression_models_select on progression_models;
create policy progression_models_select on progression_models for select using (public.is_coach());
drop policy if exists progression_models_write on progression_models;
create policy progression_models_write on progression_models for all using (public.is_coach()) with check (public.is_coach());

alter table programs add column if not exists top_phase progression_top_phase not null default 'foundation';
alter table programs add column if not exists sub_phase program_sub_phase not null default 'foundation';
-- Snapshot of which model the AI actually used for this program — not an FK,
-- so editing/retiring a model later never orphans a past program's record.
alter table programs add column if not exists progression_model_key text;

alter table program_phase_history add column if not exists top_phase progression_top_phase;
alter table program_phase_history add column if not exists sub_phase program_sub_phase;

insert into progression_models (key, label, top_phase, pillar_lean, methodology) values
('conjugate', 'Conjugate (Max/Dynamic Effort)', 'foundation', 'powerlifting',
 'Rotate a Max Effort day (work up to a heavy 1-3RM on a main-lift variation, then heavy accessory work) with a Dynamic Effort day (submaximal loads ~50-60% 1RM moved with maximal bar speed for low reps across several sets, e.g. 8x3) for the same lift pattern. Rotate the specific ME variation every 1-3 weeks (e.g. box squat -> safety-bar squat -> front squat) to keep accommodating resistance high without grinding the same lift into a rut. Best fit for a client with a higher Nervous System Recruitment score who can tolerate and recover from frequent near-maximal effort.'),
('percentage_based', 'Percentage-Based Loading', 'foundation', 'powerlifting',
 'Prescribe every main-lift set as a percentage of a known or estimated 1RM (e.g. 5x5 @ 75%, progressing 2.5-5% week over week within the block). Predictable, low-guesswork loading — the default, safest choice for a client without extensive powerlifting training-age or one whose Nervous System Recruitment score is moderate. State the working percentage explicitly in the exercise notes.'),
('apre', 'APRE (Autoregulated Progressive Resistance Exercise)', 'foundation', 'powerlifting',
 'After a light-to-moderate warm-up set, prescribe a fixed-rep target set (e.g. 3 reps) at a percentage estimate, then have the client perform an all-out AMRAP set at that same weight — the reps achieved beyond the target on the AMRAP set determine next session''s load adjustment (a standard APRE rep-to-load adjustment chart). Autoregulates around daily readiness instead of a rigid percentage. Best fit for a client with a lower or highly variable Nervous System Recruitment score, or where session-to-session recovery is inconsistent (e.g. poor sleep flagged).'),
('double_progression', 'Double Progression (Accessories)', 'accumulation', 'bodybuilding',
 'For each accessory/isolation exercise, prescribe a rep RANGE (e.g. 8-12) at a fixed weight. The client adds reps set-to-set/session-to-session until hitting the top of the range for all working sets with clean form, then increases the load and drops back to the bottom of the range. Straightforward, low-fatigue-cost hypertrophy progression — the default accessory-progression model for the Accumulation block.'),
('density_progression', 'Density Progression (Volume Work)', 'accumulation', 'conditioning',
 'Hold the exercise selection, load, and total reps/rounds constant across a training block, and progress by reducing rest time or increasing reps completed within a fixed time window (e.g. an EMOM or AMRAP-style volume block) — same or more work in less time. Best fit for a client whose Metabolic Work Capacity score is lower and needs conditioning volume built up before it makes sense to add more intensity.'),
('performance_taper', 'Accumulation/Intensification Taper Into Testing', 'performance', 'conditioning',
 'Reduce overall volume week over week while maintaining or slightly increasing intensity, culminating in a short all-out performance/testing window (a true 1-3RM test, a benchmark conditioning piece, or both) at the end of the block. This is deliberately the shortest block in the cycle — a peak, not a place to accumulate more fatigue. Taper conditioning volume in parallel with strength volume so the client arrives fresh for the test.')
on conflict (key) do nothing;
