-- Structured goal tracking for the Intelligent Goals Engine. Unlike
-- profiles.goal (free text, decorative), this captures a real baseline ->
-- target with a timeframe, so progress can be computed instead of guessed.
--
-- `metric_key` tells the scoring engine (src/lib/scoring/goalScoring.js) which
-- existing table/column feeds the trend series:
--   'bodyweight'        -> daily_checkins.weight (falls back to weekly_checkins.bodyweight)
--   'chest'|'waist'|'hips'|'arms' -> weekly_checkins.<key>
--   'bench_1rm' etc.    -> derived from workout_logs for that exercise
--   'habit:<habit_id>'  -> habit_logs for that habit
-- Nutrition/training-consistency/recovery/habit-adherence are always pulled
-- live from their own tables at scoring time — this table only stores the
-- primary metric being targeted, not the whole picture.
--
-- Normally coach-managed (mirrors programs/nutrition_plans): the coach sets
-- the goal during onboarding/review and the client reads it. Program-only
-- (no-coach) clients have no coach touchpoint though, so they set their own
-- goal from the self-service card on their Progress page
-- (src/features/progress/ProgramProgressPage.jsx) -- the write policy below
-- allows both. Only one active goal per client per metric_key is meaningful,
-- but that's left as a UI convention rather than a DB constraint, since a
-- client may legitimately have a superseded goal history worth keeping.
--
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'goal_type') then
    create type goal_type as enum ('weight','body_composition','strength','endurance','habit','custom');
  end if;
  if not exists (select 1 from pg_type where typname = 'goal_direction') then
    create type goal_direction as enum ('increase','decrease','maintain');
  end if;
  if not exists (select 1 from pg_type where typname = 'goal_status') then
    create type goal_status as enum ('active','achieved','abandoned','superseded');
  end if;
end $$;

create table if not exists client_goals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles (id) on delete cascade,
  goal_type goal_type not null,
  metric_key text not null,
  direction goal_direction not null,
  unit text not null,
  baseline_value numeric not null,
  baseline_date date not null,
  target_value numeric not null,
  target_date date not null,
  status goal_status not null default 'active',
  notes text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_client_goals_client on client_goals (client_id, status);

alter table client_goals enable row level security;
-- Client reads their own; coach reads all.
drop policy if exists goals_select on client_goals;
create policy goals_select on client_goals for select using (client_id = auth.uid() or public.is_coach());
-- Coach sets/edits goals; client can also self-manage (program-only clients).
drop policy if exists goals_write on client_goals;
create policy goals_write on client_goals for all
  using (client_id = auth.uid() or public.is_coach())
  with check (client_id = auth.uid() or public.is_coach());

-- AI-generated coaching insights layered on top of the computed score.
-- Separate from client_summaries: that table's period is a monthly recap
-- cadence, while this is refreshed whenever the coach clicks "Generate
-- insight" for a specific goal, so the two shouldn't share a uniqueness key.
create table if not exists client_goal_insights (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles (id) on delete cascade,
  goal_id uuid not null references client_goals (id) on delete cascade,
  insight_text text not null,
  score_snapshot jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_goal_insights_goal on client_goal_insights (goal_id, created_at desc);

alter table client_goal_insights enable row level security;
drop policy if exists goal_insights_select on client_goal_insights;
create policy goal_insights_select on client_goal_insights for select using (client_id = auth.uid() or public.is_coach());
drop policy if exists goal_insights_write on client_goal_insights;
create policy goal_insights_write on client_goal_insights for all using (public.is_coach()) with check (public.is_coach());
