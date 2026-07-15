-- Coach onboarding assessment, keyed by email so the coach can pre-assess a
-- client BEFORE they sign up. Coach-only (never visible to the client). When the
-- client later signs up, the coach client view matches this by email, and the
-- program generator folds it into the prompt. Mirrors the coach's Notion scoring
-- database: the three V12 scores plus free-text strengths/weaknesses/etc.
--
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.
create table if not exists client_assessments (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  -- V12 three-system scores (optional, 1-10)
  nervous_system_recruitment int,
  muscular_density_to_size int,
  metabolic_work_capacity int,
  -- free-text onboarding notes — what a coach looks for at intake
  strengths text,
  weaknesses text,
  injuries text,
  training_history text,
  recovery_lifestyle text,
  goal_focus text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table client_assessments enable row level security;
-- Coach-only: read, create, edit, delete. Never exposed to clients.
drop policy if exists assessments_all on client_assessments;
create policy assessments_all on client_assessments for all using (public.is_coach()) with check (public.is_coach());
