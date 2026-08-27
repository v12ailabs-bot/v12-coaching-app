-- Day-0 onboarding gate: assessment -> coach review -> roadmap confirmed.
-- Everything a client can already answer (goal, training experience,
-- activity level) lives on profiles/leads and is read directly by the UI --
-- this table only tracks the handful of steps that have no natural signal
-- of their own and need explicit state + a coach-side gate:
--   'assessment'      (owner client)  -> client completes/submits assessment
--   'coach_review'    (owner coach)   -> coach reviews assessment + goals
--   'roadmap_ready'   (owner coach)   -> coach confirms roadmap/program, unlocking Week 1
-- Chained by depends_on_key so each becomes active only once its
-- dependency is completed (dependency-based activation, not just time-based).
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'onboarding_task_owner') then
    create type onboarding_task_owner as enum ('client', 'coach', 'system');
  end if;
  if not exists (select 1 from pg_type where typname = 'onboarding_task_status') then
    create type onboarding_task_status as enum
      ('not_started', 'in_progress', 'completed', 'waiting', 'blocked', 'skipped', 'requires_review');
  end if;
end $$;

create table if not exists client_onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles (id) on delete cascade,
  task_key text not null,
  owner onboarding_task_owner not null,
  status onboarding_task_status not null default 'not_started',
  depends_on_key text,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, task_key)
);
create index if not exists idx_onboarding_tasks_client on client_onboarding_tasks (client_id, status);

alter table client_onboarding_tasks enable row level security;
-- Coach-owned/system-owned rows are never exposed to the client -- enforced
-- at the RLS layer, not just hidden in the UI.
drop policy if exists onboarding_tasks_select on client_onboarding_tasks;
create policy onboarding_tasks_select on client_onboarding_tasks for select
  using (public.is_coach() or (client_id = auth.uid() and owner = 'client'));
drop policy if exists onboarding_tasks_write on client_onboarding_tasks;
create policy onboarding_tasks_write on client_onboarding_tasks for all
  using (public.is_coach() or (client_id = auth.uid() and owner = 'client'))
  with check (public.is_coach() or (client_id = auth.uid() and owner = 'client'));
