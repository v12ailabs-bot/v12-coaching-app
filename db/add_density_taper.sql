-- Density progression + performance taper: database support. Requires
-- add_progression_engine.sql and add_prescribed_weight.sql. Idempotent; additive;
-- safe to re-run. Apply via the Supabase SQL Editor.

-- 1) Deciding NON-LOAD recommendations (density) ---------------------------------
-- Density recommendations propose a change to a TARGET (more work, less time), not
-- a load, so recommended_load is null and calc_result.calc.nonLoad is true. Approve
-- records the decision and applies the engine's configPatch (the new target) to the
-- exercise's progression_config in the same transaction; hold/regression results are
-- "acknowledged" with nothing applied. Modify is for loads only. Load
-- recommendations behave exactly as before.
create or replace function decide_progression_recommendation(p_rec_id uuid, p_decision text, p_modified_load numeric default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r progression_recommendations%rowtype;
  v_load numeric;
  v_status text;
  v_presc jsonb;
  v_nonload boolean;
  v_patch jsonb;
begin
  if not public.is_coach() then raise exception 'Only a coach can decide a progression recommendation.'; end if;
  if p_decision not in ('approve', 'modify', 'reject') then raise exception 'decision must be approve, modify or reject.'; end if;
  select * into r from progression_recommendations where id = p_rec_id for update;
  if not found then raise exception 'Recommendation not found.'; end if;
  if r.status <> 'pending' then raise exception 'This recommendation was already %.', r.status; end if;
  v_nonload := coalesce((r.calc_result->'calc'->>'nonLoad')::boolean, false);

  if p_decision = 'reject' then
    v_status := 'rejected'; v_presc := null;
  elsif v_nonload then
    if p_decision = 'modify' then raise exception 'modify applies to load recommendations only; reject this one and edit the exercise settings instead.'; end if;
    v_status := 'approved';
    v_patch := r.calc_result->'proposedAdjustment'->'configPatch';
    v_presc := jsonb_build_object('source', 'calculated', 'adjustment', r.calc_result->'proposedAdjustment', 'acknowledged', v_patch is null);
  elsif p_decision = 'approve' then
    if r.recommended_load is null or r.recommended_load <= 0 then raise exception 'There is no calculated load to approve; use modify to set one.'; end if;
    v_load := r.recommended_load; v_status := 'approved';
    v_presc := jsonb_build_object('load', v_load, 'source', 'calculated');
  else
    if p_modified_load is null or p_modified_load <= 0 then raise exception 'modify requires a positive load.'; end if;
    v_load := p_modified_load; v_status := 'modified';
    v_presc := jsonb_build_object('load', v_load, 'source', 'coach_override', 'calculatedLoad', r.recommended_load);
  end if;

  update progression_recommendations set status = v_status, approved_prescription = v_presc, decided_by = auth.uid(), decided_at = now(),
         decision_note = nullif(btrim(coalesce(p_note, '')), '') where id = r.id;
  if v_load is not null then
    update exercises set prescribed_weight = v_load, prescribed_set_at = now(), prescribed_recommendation_id = r.id where id = r.exercise_id;
  end if;
  if v_patch is not null and p_decision = 'approve' then
    update exercises set progression_config = coalesce(progression_config, '{}'::jsonb) || v_patch where id = r.exercise_id;
  end if;
  return jsonb_build_object('status', v_status, 'prescribed_weight', v_load, 'exercise_id', r.exercise_id, 'applied_config_patch', case when p_decision = 'approve' then v_patch else null end);
end $$;
grant execute on function decide_progression_recommendation(uuid, text, numeric, text) to authenticated;

-- 2) Taper plans, with an audit trail --------------------------------------------
-- config = the coach's inputs; calculated = the engine's original output; BOTH are
-- immutable (trigger). current_plan = what is in force (starts equal to calculated,
-- changes only through coach overrides). override_log is append-only: every override
-- with who, when, why, and before/after. The event/test date ends the taper; nothing
-- restarts or extends it automatically.
create table if not exists taper_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles (id) on delete cascade,
  program_id uuid references programs (id) on delete set null,
  name text not null,
  event_date date not null,
  status text not null default 'planned' check (status in ('planned', 'active', 'completed', 'cancelled')),
  config jsonb not null,
  calculated jsonb not null,
  current_plan jsonb not null,
  override_log jsonb not null default '[]',
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_taper_plans_client on taper_plans (client_id, event_date desc);

create or replace function taper_plans_guard() returns trigger language plpgsql as $$
declare i int;
begin
  if new.config is distinct from old.config or new.calculated is distinct from old.calculated
     or new.event_date is distinct from old.event_date or new.client_id is distinct from old.client_id then
    raise exception 'taper_plans: the original plan (config, calculated, event date) is immutable; record changes as overrides in current_plan and override_log';
  end if;
  if jsonb_typeof(new.override_log) is distinct from 'array' or jsonb_array_length(new.override_log) < jsonb_array_length(old.override_log) then
    raise exception 'taper_plans: override_log is append-only';
  end if;
  for i in 0 .. jsonb_array_length(old.override_log) - 1 loop
    if new.override_log -> i is distinct from old.override_log -> i then raise exception 'taper_plans: override_log is append-only'; end if;
  end loop;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_taper_plans_guard on taper_plans;
create trigger trg_taper_plans_guard before update on taper_plans for each row execute function taper_plans_guard();

alter table taper_plans enable row level security;
drop policy if exists taper_plans_select on taper_plans;
create policy taper_plans_select on taper_plans for select using (public.is_coach());
drop policy if exists taper_plans_insert on taper_plans;
create policy taper_plans_insert on taper_plans for insert with check (public.is_coach());
drop policy if exists taper_plans_update on taper_plans;
create policy taper_plans_update on taper_plans for update using (public.is_coach()) with check (public.is_coach());
-- no delete policy: audit history can't be deleted from the app
