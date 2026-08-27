-- Additive milestone fields on the existing client_goals table. The
-- existing single-active-bodyweight-goal flow (GoalsSection, ProgressPage,
-- ProgramProgressPage, ClientHome, ClientInsightCard, ProgressSummaryCard --
-- six call sites, all `.eq("metric_key","bodyweight").limit(1)`) is left
-- completely untouched: those rows simply have category/priority left null.
-- New exercise-based milestones (bench/squat/pull-ups/etc.) opt into these
-- columns instead, and are queried separately by category is not null --
-- avoids an invasive rewrite of an already-working, widely-used feature.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'milestone_category') then
    create type milestone_category as enum
      ('strength', 'rep_performance', 'exercise_progression', 'conditioning', 'movement_competency', 'body_composition', 'consistency');
  end if;
  if not exists (select 1 from pg_type where typname = 'milestone_priority') then
    create type milestone_priority as enum ('primary', 'secondary');
  end if;
end $$;

alter table client_goals add column if not exists category milestone_category;
alter table client_goals add column if not exists priority milestone_priority not null default 'secondary';
-- Exercise this milestone tracks, for category in (strength, rep_performance,
-- exercise_progression) -- current_value is read live from workout_logs for
-- this exercise name rather than stored, so it can never drift stale.
alter table client_goals add column if not exists exercise_name text;
create index if not exists idx_client_goals_category on client_goals (client_id, category) where category is not null;
