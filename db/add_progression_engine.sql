-- Progression engine, Slice 1: the data layer for deterministic, coach-approved
-- progression recommendations. Idempotent; safe to re-run. Apply via the
-- Supabase SQL Editor.
--
-- Compatibility: workout_logs is ALREADY set-level (one row per set; `sets`
-- holds the set number). Existing rows keep working unchanged — every new
-- column is nullable or defaulted, and all existing history becomes
-- set_type = 'working'. Nothing existing reads or writes the new columns yet.

-- 1) Set-level detail on workout_logs ---------------------------------------
alter table workout_logs add column if not exists set_type text not null default 'working';
alter table workout_logs add column if not exists prescribed_reps int;
alter table workout_logs add column if not exists prescribed_weight numeric;
alter table workout_logs add column if not exists rir numeric;
alter table workout_logs add column if not exists rpe numeric;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'workout_logs_set_type_check') then
    alter table workout_logs add constraint workout_logs_set_type_check check (set_type in ('warmup', 'working'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'workout_logs_rir_check') then
    alter table workout_logs add constraint workout_logs_rir_check check (rir is null or (rir >= 0 and rir <= 10));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'workout_logs_rpe_check') then
    alter table workout_logs add constraint workout_logs_rpe_check check (rpe is null or (rpe >= 1 and rpe <= 10));
  end if;
end $$;

-- 2) Per-exercise progression assignment ------------------------------------
-- progression_method: a method id from src/lib/progression/methods.js (not an
-- enum, so adding a method never needs a migration; validated in code).
-- progression_config: that method's parameters (rep range, required sets,
-- increment, effort rules...) validated by the engine, not trusted blindly.
alter table exercises add column if not exists progression_method text;
alter table exercises add column if not exists progression_config jsonb not null default '{}'::jsonb;

-- 3) Recommendations, kept separate from what the coach approves -------------
-- calc_input / calc_result / recommended_load are the ORIGINAL deterministic
-- calculation and never change after insert (trigger below). The coach's
-- decision lives in status + approved_prescription, so an override never
-- overwrites the calculation it overrode.
create table if not exists progression_recommendations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles (id) on delete cascade,
  exercise_id uuid not null references exercises (id) on delete cascade,
  method_id text not null,
  session_date date not null,
  calc_input jsonb not null,
  calc_result jsonb not null,
  recommended_load numeric,
  status text not null default 'pending' check (status in ('pending', 'approved', 'modified', 'rejected')),
  approved_prescription jsonb,
  decided_by uuid references profiles (id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);
-- One recommendation per exercise + method + session: re-running the engine on
-- the same session can't stack duplicates.
create unique index if not exists idx_progression_recs_unique on progression_recommendations (exercise_id, method_id, session_date);
create index if not exists idx_progression_recs_client on progression_recommendations (client_id, created_at desc);

create or replace function progression_recs_freeze_calc() returns trigger language plpgsql as $$
begin
  if new.calc_input is distinct from old.calc_input
     or new.calc_result is distinct from old.calc_result
     or new.recommended_load is distinct from old.recommended_load
     or new.method_id is distinct from old.method_id
     or new.exercise_id is distinct from old.exercise_id
     or new.session_date is distinct from old.session_date then
    raise exception 'progression_recommendations: the original calculation is immutable; record overrides in approved_prescription';
  end if;
  return new;
end $$;
drop trigger if exists trg_progression_recs_freeze_calc on progression_recommendations;
create trigger trg_progression_recs_freeze_calc before update on progression_recommendations
  for each row execute function progression_recs_freeze_calc();

alter table progression_recommendations enable row level security;
-- Coach-only, same convention as progression_models: these are coaching
-- decisions, not something clients read or write.
drop policy if exists progression_recs_coach on progression_recommendations;
create policy progression_recs_coach on progression_recommendations for all using (public.is_coach()) with check (public.is_coach());
