-- Approving a program now replaces ALL of the client's previous exercises, not only the AI-generated ones.
-- Before, coach-sourced exercises (hand-added, or leftovers such as ones a stale phase draft re-created) survived
-- every approval and piled up next to the new program as extra days / an Unscheduled group.
-- As before: exercises with logged sets are never deleted (retired instead, history stays); unlogged ones are replaced.
-- Run AFTER fix_stale_phase_drafts.sql. Idempotent; safe to re-run.

create or replace function public.approve_program_draft(p_draft_id uuid, p_keep_exercise_ids uuid[] default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  d program_drafts%rowtype;
  prev programs%rowtype;
  new_program_id uuid;
begin
  if not public.is_coach() then
    raise exception 'Only a coach can approve a program draft';
  end if;

  select * into d from program_drafts where id = p_draft_id for update;
  if not found then raise exception 'Program draft not found'; end if;
  if d.status <> 'draft' then raise exception 'Draft is not awaiting approval (status: %)', d.status; end if;

  -- Last line of defence behind the JS validator: refuse a structurally broken draft.
  if jsonb_typeof(d.payload -> 'weekly_split') is distinct from 'array' or jsonb_array_length(d.payload -> 'weekly_split') = 0 then
    raise exception 'Draft has no training days';
  end if;
  if exists (
    select 1 from jsonb_array_elements(d.payload -> 'weekly_split') as day
    where jsonb_typeof(day -> 'exercises') is distinct from 'array' or jsonb_array_length(day -> 'exercises') = 0
       or coalesce(day ->> 'day', '') not in ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')
  ) then
    raise exception 'Draft has an empty or unrecognised training day';
  end if;
  if exists (
    select 1 from jsonb_array_elements(d.payload -> 'weekly_split') as day,
                  jsonb_array_elements(day -> 'exercises') as e
    where coalesce(btrim(e ->> 'name'), '') = ''
       or coalesce(e ->> 'sets', '') !~ '^[0-9]+$' or (e ->> 'sets')::int not between 1 and 12
       or coalesce(btrim(e ->> 'reps'), '') = ''
       or (coalesce(e ->> 'rest_seconds', '') <> '' and ((e ->> 'rest_seconds') !~ '^[0-9]+$' or (e ->> 'rest_seconds')::int > 600))
  ) then
    raise exception 'Draft contains an exercise with a missing name, sets, reps or an invalid rest period';
  end if;

  -- Reuse the client's existing program row when there is one, so everything
  -- hanging off it (roadmap phases, phase history, coach settings such as roadmap
  -- visibility / check-in editing, start date, version history) stays attached.
  -- Only a client with no program yet gets a new row.
  select * into prev from programs where client_id = d.client_id order by created_at desc limit 1;

  if found then
    new_program_id := prev.id;
    update programs set
      name = d.payload ->> 'program_name',
      goal = coalesce(d.payload ->> 'goal', prev.goal),
      description = 'AI-generated V12 program, coach-approved' || coalesce(' · template: ' || d.template_name, ''),
      weeks = coalesce((d.payload ->> 'weeks')::int, prev.weeks, 12),
      progression_model_key = coalesce(d.payload ->> 'progression_model_used', prev.progression_model_key),
      session_minutes = nullif(d.session_config ->> 'session_minutes', '')::int,
      session_arrangement = d.session_config ->> 'arrangement',
      session_prep = d.session_config ->> 'prep',
      session_finish = d.session_config ->> 'finish'
    where id = prev.id;
  else
    insert into programs (client_id, name, goal, description, weeks, top_phase, sub_phase, progression_model_key,
                          session_minutes, session_arrangement, session_prep, session_finish)
    values (d.client_id,
            d.payload ->> 'program_name',
            d.payload ->> 'goal',
            'AI-generated V12 program, coach-approved' || coalesce(' · template: ' || d.template_name, ''),
            coalesce((d.payload ->> 'weeks')::int, 12),
            'foundation', 'foundation',
            d.payload ->> 'progression_model_used',
            nullif(d.session_config ->> 'session_minutes', '')::int,
            d.session_config ->> 'arrangement', d.session_config ->> 'prep', d.session_config ->> 'finish')
    returning id into new_program_id;
  end if;

  -- ALL of the client's previous active exercises (any source: AI, or coach-added/leftover). Ones with logged sets are never deleted
  -- (that would cascade-delete the client's history): the coach chooses which to
  -- KEEP in the program (p_keep_exercise_ids); the rest are RETIRED — they leave
  -- the client's workout screen but their logs stay on record. When no choice is
  -- passed (null) every logged exercise is kept. Unlogged AI exercises are replaced.
  update exercises set program_id = new_program_id
   where client_id = d.client_id and retired_at is null
     and exists (select 1 from workout_logs l where l.exercise_id = exercises.id)
     and (p_keep_exercise_ids is null or id = any (p_keep_exercise_ids));
  update exercises set retired_at = now(), retired_reason = 'Replaced when the coach approved a new program'
   where client_id = d.client_id and retired_at is null
     and exists (select 1 from workout_logs l where l.exercise_id = exercises.id)
     and p_keep_exercise_ids is not null and not (id = any (p_keep_exercise_ids));
  delete from exercises
   where client_id = d.client_id and retired_at is null
     and not exists (select 1 from workout_logs l where l.exercise_id = exercises.id);

  insert into exercises (client_id, program_id, name, category, section, exercise_type, day_of_week,
                         sets, reps, rest_seconds, is_bodyweight, notes, order_index, block_type, group_id, source)
  select d.client_id, new_program_id, btrim(e ->> 'name'), nullif(e ->> 'category', ''), nullif(e ->> 'section', ''),
         nullif(e ->> 'exercise_type', ''), day ->> 'day',
         (e ->> 'sets')::int, btrim(e ->> 'reps'), nullif(e ->> 'rest_seconds', '')::int,
         coalesce((e ->> 'is_bodyweight')::boolean, false), nullif(e ->> 'notes', ''),
         coalesce((e ->> 'order_index')::int, (ord - 1)::int), coalesce(nullif(e ->> 'block_type', ''), 'straight_set'),
         nullif(e ->> 'group_id', ''), 'ai'
  from jsonb_array_elements(d.payload -> 'weekly_split') as day,
       jsonb_array_elements(day -> 'exercises') with ordinality as x(e, ord);

  update program_drafts set status = 'superseded', updated_at = now()
   where client_id = d.client_id and status = 'draft' and id <> d.id;
  update program_drafts set status = 'approved', approved_at = now(), approved_by = auth.uid(),
                            approved_program_id = new_program_id, updated_at = now()
   where id = d.id;

  -- Phase prescriptions that were drafted from the PREVIOUS exercise list are now out of date: activating one
  -- would bring the old program back. Mark unapplied ones superseded; the coach rebuilds them from the plan.
  if to_regclass('public.phase_prescription_drafts') is not null then
    update phase_prescription_drafts set status = 'superseded', updated_at = now()
     where program_id = new_program_id and status = 'draft';
  end if;

  if d.profile_id is not null then
    update profiles set onboarding_complete = true where id = d.profile_id;
  end if;
  return new_program_id;
end;
$$;
revoke all on function public.approve_program_draft(uuid, uuid[]) from public;
grant execute on function public.approve_program_draft(uuid, uuid[]) to authenticated;
