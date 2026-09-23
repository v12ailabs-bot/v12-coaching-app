-- ---
-- PROPOSAL — HC-002 Database Foundation (V12 Head Coach, REVIEW_CHECK_IN slice)
-- STATUS: NOT YET APPLIED. Awaiting owner review per the small-slice process
-- agreed for this build. Do not run against Supabase until reviewed/approved.
-- ---
--
-- Scope: the minimum net-new schema to support
--   Check-In -> Task -> Context -> Safety/Rules -> Claude -> Validation ->
--   Recommendation -> Coach Approval -> Intervention -> Outcome
-- for exactly one task type, REVIEW_CHECK_IN. Everything else (autonomous
-- actions, other task types, client-facing surfaces) is deferred.
--
-- Design decisions baked into this file (flagged, not hidden):
--   1. OBJECTIVE / CURRENT STATE: reuses client_goals as-is (no new
--      objectives/current_states tables), per owner decision. Current-state
--      values continue to be computed live via the existing metric_key
--      convention (src/lib/scoring/goalScoring.js, src/lib/milestones.js) —
--      Context Builder (HC-006, not in this file) will wrap that in one
--      shared helper rather than a new read path.
--   2. RULE REGISTRY: NOT a DB table in this slice. Proposed as a versioned
--      TS module (HC-007, not in this file) — rule_id/version/status are
--      code-reviewed and deploy-gated, which is a stricter guarantee than a
--      coach-editable DB table for a rules system nothing should modify at
--      runtime anyway. rule_versions actually applied to a given
--      recommendation are still recorded (see head_coach_context_snapshots /
--      head_coach_audit_events below), so this remains fully auditable.
--   3. DECISIONS / RECOMMENDATIONS / COACH_OVERRIDES: consolidated into one
--      table, head_coach_recommendations, instead of three. ai_output is
--      written once and never updated (satisfies "never overwrite the
--      original recommendation"); coach_decision/coach_modification are
--      separate columns set exactly once by the approval action. This
--      mirrors the existing program_phase_recommendations pattern
--      (db/add_phase_recommendations.sql) generalized to any task type.
--   4. INTERVENTIONS: not a separate table yet. For this MVP slice (no
--      autonomous action executor — HC-016 is explicitly deferred), an
--      "intervention" IS an approved/modified head_coach_recommendations row;
--      a dedicated interventions table only earns its keep once HC-016
--      exists and something is actually executed automatically.
--   5. ALERTS: not a new table. "Open alerts" for Context Builder continue
--      to be computed on read, same as AlertsPanel/PhaseAlertsPanel/
--      MilestoneAlertsPanel do today.
--   6. WRITE ACCESS: none of these tables get an insert/update policy for
--      the anon/authenticated role. All writes happen server-side via
--      supabaseAdmin (service role, bypasses RLS), same as every other
--      api/*.js file in this repo. Coaches get read access only, via
--      is_coach(). This is what makes "backend is authoritative" and "never
--      expose generic DB write functionality" actual guarantees rather than
--      conventions — do not add a client-writable policy to these tables
--      without re-reading why they were built this way.
--
-- Explicitly NOT in this file (deferred, see chat writeup):
--   - the check-in -> task trigger mechanism (HC-005)
--   - task processing / claiming worker (HC-005/006)
--   - api/head-coach.* endpoint(s) (HC-004, also where the JS/TS boundary
--     for this feature starts)
--   - requireClient()/generic auth helper (HC-003)
--   - anything client-facing (HC-019/020)
--
-- FK deletion behavior, reviewed and deliberate (not an oversight):
--   client_id on head_coach_tasks/recommendations uses ON DELETE CASCADE,
--   matching 100% of existing client_id columns in this schema
--   (db/schema.sql, every db/add_*.sql) — including program_versions, the
--   closest existing "immutable snapshot" analog, which also cascades. There
--   is no in-app feature to hard-delete a client profile (grep confirms it —
--   the only way a profiles row disappears is a direct, deliberate DB/admin
--   action outside the app). Given that, making ONLY the Head Coach tables
--   survive a profile delete would produce inconsistent, confusing
--   client-deletion semantics app-wide (some history purged, some not) for
--   a scenario that isn't an exercised code path. head_coach_audit_events is
--   the one place this reasoning does NOT apply — see its own comment below.
--
--   task_id (on context_snapshots and recommendations) and recommendation_id
--   (on outcomes) are ON DELETE RESTRICT, not CASCADE, and this is load-
--   bearing, not cosmetic: in Postgres, a cascading delete is implemented as
--   a real DELETE on the child table and DOES fire the child's own row
--   triggers. Since context_snapshots/recommendations/outcomes are
--   protected by the no-update/no-delete triggers below, a CASCADE here
--   would never actually cascade — it would fire the child's forbid-delete
--   trigger and abort the whole transaction, including the task/
--   recommendation delete that triggered it. RESTRICT declares that same
--   real behavior honestly (a standard FK-violation error) instead of lying
--   about "cascade" and relying on a second, indirect mechanism to prevent
--   it. Net effect, worth knowing: once a client has ANY head_coach
--   recommendation history, deleting their profile will fail outright
--   (blocked by this RESTRICT, however many levels down) rather than
--   silently losing Head Coach data — a stronger guarantee than the
--   client_id CASCADE above would suggest on its own.
--
-- Immutability, actually enforced (not just RLS/app convention):
--   supabaseAdmin (service role) bypasses RLS, so an RLS policy that omits
--   an UPDATE/DELETE grant is NOT an immutability guarantee against backend
--   code — a future task-processing bug could still overwrite ai_output.
--   Postgres triggers fire regardless of role (including service_role) and
--   are NOT bypassed by BYPASSRLS, so that's the smallest reliable
--   enforcement mechanism available here; used below on exactly the three
--   places the spec calls out as immutable/append-only.
--
-- Idempotent; safe to re-run, same convention as the rest of db/*.sql.
-- ---

do $$ begin
  if not exists (select 1 from pg_type where typname = 'head_coach_task_status') then
    create type head_coach_task_status as enum (
      'QUEUED', 'CONTEXT_BUILDING', 'READY', 'PROCESSING', 'DECISION_READY',
      'ACTION_PENDING', 'MONITORING', 'CLOSED', 'FAILED', 'RETRYING', 'ESCALATED'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'head_coach_recommendation_status') then
    create type head_coach_recommendation_status as enum (
      'pending', 'approved', 'modified', 'rejected', 'deferred', 'superseded'
    );
  end if;
end $$;

-- One row per Head Coach task instance. task_type is text + a check
-- constraint (not an enum) so adding a second task type later is a cheap
-- constraint change, not an enum-alteration migration. source_table is
-- similarly constrained (daily_checkins.id and weekly_checkins.id are both
-- uuid primary keys, confirmed against db/schema.sql) since REVIEW_CHECK_IN
-- can originate from either check-in cadence.
create table if not exists head_coach_tasks (
  id uuid primary key default gen_random_uuid(),
  task_type text not null check (task_type in ('REVIEW_CHECK_IN')),
  client_id uuid not null references profiles (id) on delete cascade,
  status head_coach_task_status not null default 'QUEUED',
  -- The row that triggered this task, e.g. ('daily_checkins', <check-in id>).
  -- unique(task_type, source_table, source_id) is the idempotency key — named
  -- explicitly rather than relying on uuids being globally unique across
  -- tables, so a duplicate trigger fire can't enqueue the same review twice.
  source_table text not null check (source_table in ('daily_checkins', 'weekly_checkins')),
  source_id uuid not null,
  attempt_count int not null default 0,
  last_error text,
  locked_by text,
  locked_at timestamptz,
  claimed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_type, source_table, source_id)
);
create index if not exists idx_head_coach_tasks_status on head_coach_tasks (status, created_at);
create index if not exists idx_head_coach_tasks_client on head_coach_tasks (client_id, created_at desc);

alter table head_coach_tasks enable row level security;
drop policy if exists head_coach_tasks_select on head_coach_tasks;
create policy head_coach_tasks_select on head_coach_tasks for select using (public.is_coach());

-- Immutable context snapshot assembled for a task at READY time. Insert-only
-- by design (mirrors program_versions' "immutable snapshot" pattern) — a
-- consequential decision must always be explainable from exactly the data
-- that was actually in front of the model when it reasoned.
create table if not exists head_coach_context_snapshots (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references head_coach_tasks (id) on delete restrict,
  snapshot jsonb not null,
  rule_versions jsonb not null default '[]'::jsonb,
  methodology_version text,
  created_at timestamptz not null default now()
);
create index if not exists idx_head_coach_snapshots_task on head_coach_context_snapshots (task_id);

alter table head_coach_context_snapshots enable row level security;
drop policy if exists head_coach_snapshots_select on head_coach_context_snapshots;
create policy head_coach_snapshots_select on head_coach_context_snapshots for select using (public.is_coach());

-- True insert-only enforcement: no role, including service_role (which
-- BYPASSRLS but is not exempt from triggers), may UPDATE or DELETE a row
-- here once written.
create or replace function public.head_coach_forbid_write()
returns trigger
language plpgsql
as $$
begin
  raise exception '% is append-only: % is not permitted', TG_TABLE_NAME, TG_OP;
end;
$$;

drop trigger if exists head_coach_snapshots_immutable on head_coach_context_snapshots;
create trigger head_coach_snapshots_immutable
  before update or delete on head_coach_context_snapshots
  for each row execute function public.head_coach_forbid_write();

-- The AI's structured output + the coach's decision on it, kept in one row
-- but two immutable-vs-mutable halves: ai_output/backend_authority/
-- validation_status are written once at creation and never updated;
-- coach_decision_note/coach_modification/decided_by/decided_at are written
-- exactly once by the approval action, enforced below by trigger (not just
-- app convention). status='superseded' is that same one-time transition,
-- used instead of decided_by/decided_at when a newer recommendation for the
-- same client makes an older pending one stale before any coach acted on it
-- (stale-recommendation protection) — deliberately not a separate
-- superseded_at column, so it's governed by the same lock trigger as every
-- other terminal state instead of being a second, unlocked way to mark the
-- same row "done."
--
-- status = 'approved'/'modified' records that the COACH DECIDED to accept
-- (as-is or edited) what the model proposed. It does NOT mean anything was
-- executed — this MVP slice has no action executor (HC-016 is deferred), so
-- today an "intervention" is the coach acting on this manually outside the
-- system (e.g. sending a message, editing a phase by hand in the existing
-- UI). head_coach_outcomes.recommendation_id is how a later outcome ties
-- back to the actual approved/modified content: read coach_modification if
-- present, else ai_output.recommendation — never re-derive it from ai_output
-- alone once a modification exists.
create table if not exists head_coach_recommendations (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references head_coach_tasks (id) on delete restrict,
  client_id uuid not null references profiles (id) on delete cascade,
  context_snapshot_id uuid references head_coach_context_snapshots (id) on delete restrict,
  model text not null,
  model_version text,
  latency_ms int,
  usage jsonb,
  -- Full structured output: status, observation, evidence[], interpretation,
  -- confidence, confidence_level, limiting_factor, competing_hypotheses[],
  -- options[], recommendation, rationale, authority (as CLAIMED by the
  -- model — advisory only), expected_response, review_condition,
  -- client_communication_needed, communication_draft.
  ai_output jsonb not null,
  -- Backend-computed/verified authority level (L0-L4) — authoritative over
  -- whatever ai_output.authority claims.
  backend_authority text not null check (backend_authority in ('L0', 'L1', 'L2', 'L3', 'L4')),
  validation_status text not null default 'valid'
    check (validation_status in ('valid', 'failed_schema', 'failed_rules', 'failed_safety', 'no_action_fallback')),
  status head_coach_recommendation_status not null default 'pending',
  coach_decision_note text,
  coach_modification jsonb,
  decided_by uuid references profiles (id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_head_coach_recs_client on head_coach_recommendations (client_id, created_at desc);
create index if not exists idx_head_coach_recs_task on head_coach_recommendations (task_id);
create index if not exists idx_head_coach_recs_pending on head_coach_recommendations (client_id) where status = 'pending';

alter table head_coach_recommendations enable row level security;
drop policy if exists head_coach_recs_select on head_coach_recommendations;
create policy head_coach_recs_select on head_coach_recommendations for select using (public.is_coach());

-- Enforced, not just conventional: (1) the AI-authored columns can never
-- change after insert, regardless of which role issues the UPDATE; (2) once
-- a decision has been recorded (status left 'pending'), the row is fully
-- locked — a second coach action, or a bug in the approval endpoint, cannot
-- silently overwrite a prior decision.
create or replace function public.head_coach_lock_recommendation()
returns trigger
language plpgsql
as $$
begin
  if NEW.ai_output is distinct from OLD.ai_output
    or NEW.model is distinct from OLD.model
    or NEW.model_version is distinct from OLD.model_version
    or NEW.latency_ms is distinct from OLD.latency_ms
    or NEW.usage is distinct from OLD.usage
    or NEW.backend_authority is distinct from OLD.backend_authority
    or NEW.validation_status is distinct from OLD.validation_status
    or NEW.task_id is distinct from OLD.task_id
    or NEW.client_id is distinct from OLD.client_id
    or NEW.context_snapshot_id is distinct from OLD.context_snapshot_id
    or NEW.created_at is distinct from OLD.created_at
  then
    raise exception 'head_coach_recommendations: AI-authored fields are immutable';
  end if;

  if OLD.status <> 'pending' then
    raise exception 'head_coach_recommendations: a decision was already recorded (status=%), row is locked', OLD.status;
  end if;

  return NEW;
end;
$$;

drop trigger if exists head_coach_recs_lock on head_coach_recommendations;
create trigger head_coach_recs_lock
  before update on head_coach_recommendations
  for each row execute function public.head_coach_lock_recommendation();

-- The lock trigger above only governs UPDATE — a DELETE would erase a
-- decision (or a pending recommendation) outright, a bigger violation of
-- "preserve historical decisions" than an overwrite. Forbid it outright.
drop trigger if exists head_coach_recs_no_delete on head_coach_recommendations;
create trigger head_coach_recs_no_delete
  before delete on head_coach_recommendations
  for each row execute function public.head_coach_forbid_write();

-- Outcome of an approved/modified recommendation, recorded later (async,
-- often days after the decision) — genuinely a separate temporal record,
-- not a column on head_coach_recommendations.
create table if not exists head_coach_outcomes (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references head_coach_recommendations (id) on delete restrict,
  expected_response text,
  actual_response text,
  measurement_period_start date,
  measurement_period_end date,
  outcome text check (outcome in ('as_expected', 'better_than_expected', 'worse_than_expected', 'inconclusive')),
  notes text,
  recorded_by uuid references profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists idx_head_coach_outcomes_rec on head_coach_outcomes (recommendation_id);

alter table head_coach_outcomes enable row level security;
drop policy if exists head_coach_outcomes_select on head_coach_outcomes;
create policy head_coach_outcomes_select on head_coach_outcomes for select using (public.is_coach());

-- Append-only audit trail. No update/delete policy for anyone, ever — only
-- service-role inserts (supabaseAdmin, bypasses RLS) are expected. This is
-- what lets event/task/context/rules/model/output/decision/coach
-- action/outcome be reconstructed after the fact.
--
-- Unlike every other client_id in this schema, this one is ON DELETE SET
-- NULL rather than CASCADE, and actor_id carries a denormalized actor_label
-- snapshot. Rationale: this table's entire purpose is to survive the working
-- data it describes — task_id/recommendation_id already SET NULL rather
-- than CASCADE for the same reason. Before this fix, actor_id had no
-- explicit ON DELETE action, which defaults to NO ACTION/RESTRICT — the only
-- FK in this entire schema that would have behaved that way, and it would
-- have BLOCKED deleting a coach or client profile that ever appeared as an
-- actor, instead of cascading like everything else. actor_label (captured
-- by the application at insert time, e.g. name/email) keeps the event
-- readable even after actor_id goes null.
create table if not exists head_coach_audit_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  task_id uuid references head_coach_tasks (id) on delete set null,
  recommendation_id uuid references head_coach_recommendations (id) on delete set null,
  client_id uuid references profiles (id) on delete set null,
  actor text not null check (actor in ('system', 'coach', 'client', 'model')),
  actor_id uuid references profiles (id) on delete set null,
  actor_label text,
  payload jsonb,
  methodology_version text,
  created_at timestamptz not null default now()
);
create index if not exists idx_head_coach_audit_task on head_coach_audit_events (task_id);
create index if not exists idx_head_coach_audit_client on head_coach_audit_events (client_id, created_at desc);
create index if not exists idx_head_coach_audit_created on head_coach_audit_events (created_at desc);

alter table head_coach_audit_events enable row level security;
drop policy if exists head_coach_audit_select on head_coach_audit_events;
create policy head_coach_audit_select on head_coach_audit_events for select using (public.is_coach());

drop trigger if exists head_coach_audit_immutable on head_coach_audit_events;
create trigger head_coach_audit_immutable
  before update or delete on head_coach_audit_events
  for each row execute function public.head_coach_forbid_write();
