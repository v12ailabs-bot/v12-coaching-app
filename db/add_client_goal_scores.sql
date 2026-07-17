-- Daily snapshot of each goal's computed score — the extension point for
-- future predictive analytics (plateau detection, churn risk, trend
-- forecasting), none of which is built yet. This table exists so that history
-- starts accumulating as soon as the Goals Engine is used in production,
-- rather than waiting for a future refactor to backfill it.
--
-- Why this is needed even though goalScoring.js is a pure function of
-- (goal, historical series, today): the underlying raw signals (daily/weekly
-- check-ins) already retain full history, so a past score COULD be
-- reconstructed retroactively by calling computeGoalScore() with an earlier
-- `today` — but only back to whenever the goal itself was created, and only
-- for the primary metric + whatever components happened to have data at that
-- point. Snapshotting on read captures the score actually seen at the time,
-- cheaply, with no new infrastructure (no cron — see the app-side write in
-- GoalsSection.jsx, one upsert per goal per calendar day of viewing).
--
-- Deliberately NOT where any prediction logic lives — this table only ever
-- gets read from, never computed from within the app itself. A future
-- predictive module (e.g. src/lib/scoring/predictiveAnalytics.js) would
-- query this table's time series per goal_id and run its own model against
-- it, following the same pattern as goalScoring.js: a pure, unit-tested
-- function taking plain data in, without needing to touch this migration,
-- the scoring module, or the Goals UI.
--
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.
create table if not exists client_goal_scores (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references client_goals (id) on delete cascade,
  client_id uuid not null references profiles (id) on delete cascade,
  date date not null,
  overall_score integer,
  classification text,
  progress_ratio numeric,
  velocity numeric,
  eta_date date,
  components jsonb,
  created_at timestamptz not null default now(),
  unique (goal_id, date)
);
create index if not exists idx_goal_scores_goal on client_goal_scores (goal_id, date);

alter table client_goal_scores enable row level security;
drop policy if exists goal_scores_select on client_goal_scores;
create policy goal_scores_select on client_goal_scores for select using (client_id = auth.uid() or public.is_coach());
-- Coach-only writes, same convention as client_goals — the snapshot is taken
-- whenever the coach views a client's Goals section (there's no client-facing
-- Goals UI yet, so this is the only path that computes a fresh score today).
drop policy if exists goal_scores_write on client_goal_scores;
create policy goal_scores_write on client_goal_scores for all using (public.is_coach()) with check (public.is_coach());
