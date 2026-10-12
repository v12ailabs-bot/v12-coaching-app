-- Approved progression loads reaching the client: exercises.prescribed_weight.
-- Requires add_progression_engine.sql. Idempotent; additive; safe to re-run.
-- Apply via the Supabase SQL Editor.
--
-- When a coach approves (or edits-and-approves) a progression recommendation,
-- the load is written to the exercise as the client's current target AND the
-- recommendation records the decision — in ONE transaction, so the two can't
-- disagree. The client's logging screen reads prescribed_weight; the original
-- calculation stays frozen on the recommendation.
alter table exercises add column if not exists prescribed_weight numeric;
alter table exercises add column if not exists prescribed_set_at timestamptz;
alter table exercises add column if not exists prescribed_recommendation_id uuid references progression_recommendations (id) on delete set null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'exercises_prescribed_weight_check') then
    alter table exercises add constraint exercises_prescribed_weight_check check (prescribed_weight is null or prescribed_weight > 0);
  end if;
end $$;

-- exercises_update lets a client edit their own exercise rows (they reschedule
-- workouts). That must not extend to rewriting the coach's prescription, so
-- the prescribed_* columns are coach-only. auth.uid() is null for the service
-- role, which stays unrestricted.
create or replace function exercises_guard_prescription() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_coach() and (
       new.prescribed_weight is distinct from old.prescribed_weight
    or new.prescribed_set_at is distinct from old.prescribed_set_at
    or new.prescribed_recommendation_id is distinct from old.prescribed_recommendation_id) then
    raise exception 'Only a coach can change an exercise''s prescribed weight.';
  end if;
  return new;
end $$;
drop trigger if exists trg_exercises_guard_prescription on exercises;
create trigger trg_exercises_guard_prescription before update on exercises for each row execute function exercises_guard_prescription();

create or replace function decide_progression_recommendation(p_rec_id uuid, p_decision text, p_modified_load numeric default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r progression_recommendations%rowtype;
  v_load numeric;
  v_status text;
  v_presc jsonb;
begin
  if not public.is_coach() then raise exception 'Only a coach can decide a progression recommendation.'; end if;
  if p_decision not in ('approve', 'modify', 'reject') then raise exception 'decision must be approve, modify or reject.'; end if;
  select * into r from progression_recommendations where id = p_rec_id for update;
  if not found then raise exception 'Recommendation not found.'; end if;
  if r.status <> 'pending' then raise exception 'This recommendation was already %.', r.status; end if;

  if p_decision = 'reject' then
    v_status := 'rejected'; v_presc := null;
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
  return jsonb_build_object('status', v_status, 'prescribed_weight', v_load, 'exercise_id', r.exercise_id);
end $$;
grant execute on function decide_progression_recommendation(uuid, text, numeric, text) to authenticated;
