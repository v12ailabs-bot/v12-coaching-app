-- 12-week plan, slices 1-2: plan details on the roadmap + append-only plan
-- history. Idempotent; additive; safe to re-run. Apply via the Supabase SQL
-- Editor.
--
-- Visibility design: program_phases rows are readable by the owning client
-- (program_phases_select), so ANYTHING stored on that row is reachable through
-- the API regardless of what the UI shows. Checkpoints (reassessment, nutrition
-- review, Day 90 review) are meant for clients, so they live on the row.
-- Rationale and planned exercise changes are speculative coaching detail and
-- stay in the coach-only program_phase_plans table below.

-- 1) Client-visible checkpoints ----------------------------------------------
-- jsonb array of { type, label, day } — type in reassessment | nutrition_review
-- | goal_review | day90_review; day = program day (0-based, Day 0 = start).
alter table program_phases add column if not exists checkpoints jsonb not null default '[]';

-- 2) Coach-only plan detail, one row per phase --------------------------------
-- planned_changes: jsonb array of { action: replace|add|remove|progress,
-- from, to, reason }. Deleting a phase removes its plan row.
create table if not exists program_phase_plans (
  phase_id uuid primary key references program_phases (id) on delete cascade,
  client_id uuid not null references profiles (id) on delete cascade,
  rationale text,
  planned_changes jsonb not null default '[]',
  updated_at timestamptz not null default now()
);
alter table program_phase_plans enable row level security;
drop policy if exists program_phase_plans_coach on program_phase_plans;
create policy program_phase_plans_coach on program_phase_plans for all using (public.is_coach()) with check (public.is_coach());

-- 3) Append-only plan history --------------------------------------------------
-- One snapshot per Save Roadmap: version 1 is the original plan, later
-- versions are revisions. No update or delete policy exists, so history can't
-- be rewritten from the app. source: 'manual' | 'ai_generated'.
create table if not exists program_phase_revisions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs (id) on delete cascade,
  client_id uuid not null references profiles (id) on delete cascade,
  version int not null,
  source text not null default 'manual' check (source in ('manual', 'ai_generated')),
  snapshot jsonb not null,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (program_id, version)
);
alter table program_phase_revisions enable row level security;
drop policy if exists program_phase_revisions_select on program_phase_revisions;
create policy program_phase_revisions_select on program_phase_revisions for select using (public.is_coach());
drop policy if exists program_phase_revisions_insert on program_phase_revisions;
create policy program_phase_revisions_insert on program_phase_revisions for insert with check (public.is_coach());
