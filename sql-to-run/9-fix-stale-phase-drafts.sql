-- Fixes a bug where activating a phase prescription AFTER approving a new program brought the old program's
-- exercises back (the draft still pointed at exercises the approval had retired; activation treated those as "new"
-- and re-created them as coach exercises next to the new program's).
--   1) activate_phase_draft refuses a draft built from retired/removed exercises (STALE_DRAFT) instead of resurrecting them.
--   2) approve_program_draft marks unapplied phase prescriptions of that program as 'superseded' (rebuild required).
-- Run AFTER add_phase_activation.sql and update_approve_program_draft_keep_choice.sql. Idempotent; safe to re-run.

create or replace function activate_phase_draft(p_phase_id uuid, p_override_note text default null, p_dry_run boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_draft phase_prescription_drafts%rowtype;
  v_phase program_phases%rowtype;
  v_cur_phase program_phases%rowtype;
  v_prog programs%rowtype;
  v_ex jsonb;
  v_cur exercises%rowtype;
  v_src uuid;
  v_new_id uuid;
  v_name text;
  v_sets int;
  v_reps text;
  v_day text;
  v_incomplete int := 0;
  v_keep uuid[] := '{}';
  v_new uuid[] := '{}';
  v_kept int := 0;
  v_updated jsonb := '[]'::jsonb;
  v_replaced jsonb := '[]'::jsonb;
  v_added jsonb := '[]'::jsonb;
  v_retired jsonb := '[]'::jsonb;
  v_trans_id uuid;
  v_changes jsonb;
  v_result jsonb;
begin
  if not public.is_coach() then raise exception 'Only a coach can activate a phase.'; end if;

  select * into v_draft from phase_prescription_drafts where phase_id = p_phase_id for update;
  if not found then raise exception 'There is no draft for this phase.'; end if;
  if v_draft.status <> 'draft' then raise exception 'This draft is already %.', v_draft.status; end if;
  if jsonb_array_length(v_draft.exercises) = 0 then raise exception 'The draft has no exercises; activating it would retire every current exercise.'; end if;

  select * into v_phase from program_phases where id = p_phase_id;
  select * into v_prog from programs where id = v_draft.program_id for update;
  if not found then raise exception 'The program for this draft no longer exists.'; end if;
  if v_prog.phase is not distinct from v_phase.phase then raise exception '"%" is already the current phase.', v_phase.phase; end if;

  -- Exit-criteria gate on the phase being LEFT.
  select * into v_cur_phase from program_phases where program_id = v_prog.id and phase = v_prog.phase order by order_index limit 1;
  if found then
    select count(*) into v_incomplete from jsonb_array_elements(v_cur_phase.exit_criteria) c where c->>'status' = 'incomplete';
    if v_incomplete > 0 and coalesce(btrim(p_override_note), '') = '' then
      raise exception 'EXIT_CRITERIA_INCOMPLETE: % exit criteria of "%" are incomplete; an override note is required.', v_incomplete, v_cur_phase.phase;
    end if;
  end if;

  begin
    for v_ex in select value from jsonb_array_elements(v_draft.exercises) loop
      v_name := btrim(coalesce(v_ex->>'name', ''));
      if v_name = '' then raise exception 'The draft contains an unnamed exercise.'; end if;
      v_sets := nullif(v_ex->>'sets', '')::int;
      v_reps := nullif(v_ex->>'reps', '');
      v_day := nullif(v_ex->>'day_of_week', '');
      v_src := nullif(v_ex->>'source_exercise_id', '')::uuid;
      v_cur := null;
      if v_src is not null then
        select * into v_cur from exercises where id = v_src and program_id = v_prog.id and retired_at is null for update;
        if not found then
          -- The draft was built from an exercise that has since been retired or removed (typically a NEW program was
          -- approved after the draft was made). Treating it as new would resurrect the old program's exercises
          -- alongside the new ones, so refuse and ask for a rebuild instead.
          raise exception 'STALE_DRAFT: "%" in this draft came from an exercise that has since been retired or removed (the program changed after the draft was made). Rebuild the draft from the plan, then activate it.', v_name;
        end if;
      end if;

      if v_src is not null then
        v_keep := v_keep || v_src;
        if lower(btrim(v_cur.name)) <> lower(v_name) then
          update exercises set retired_at = now(), retired_reason = 'Replaced in phase "' || v_phase.phase || '"' where id = v_src;
          insert into exercises (client_id, program_id, name, category, day_of_week, sets, reps, is_bodyweight, notes, order_index, source, section, exercise_type, block_type, group_id)
          values (v_cur.client_id, v_cur.program_id, v_name, v_cur.category, v_day, v_sets, v_reps, coalesce(v_cur.is_bodyweight, false), v_cur.notes, v_cur.order_index, v_cur.source, v_cur.section, v_cur.exercise_type, v_cur.block_type, v_cur.group_id)
          returning id into v_new_id;
          v_new := v_new || v_new_id;
          v_replaced := v_replaced || jsonb_build_object('old', v_src, 'new', v_new_id, 'from', v_cur.name, 'to', v_name);
        elsif v_cur.sets is distinct from v_sets or v_cur.reps is distinct from v_reps or v_cur.day_of_week is distinct from v_day then
          v_updated := v_updated || jsonb_build_object('id', v_src, 'name', v_cur.name,
            'before', jsonb_build_object('sets', v_cur.sets, 'reps', v_cur.reps, 'day_of_week', v_cur.day_of_week),
            'after', jsonb_build_object('sets', v_sets, 'reps', v_reps, 'day_of_week', v_day));
          update exercises set sets = v_sets, reps = v_reps, day_of_week = v_day where id = v_src;
        else
          v_kept := v_kept + 1;
        end if;
      else
        insert into exercises (client_id, program_id, name, category, day_of_week, sets, reps, is_bodyweight, notes, order_index, source, section, exercise_type, block_type, group_id)
        values (v_prog.client_id, v_prog.id, v_name, nullif(v_ex->>'category', ''), v_day, v_sets, v_reps, coalesce((v_ex->>'is_bodyweight')::boolean, false), nullif(v_ex->>'notes', ''),
                coalesce(nullif(v_ex->>'order_index', '')::int, 0), 'coach', nullif(v_ex->>'section', ''), nullif(v_ex->>'exercise_type', ''),
                coalesce(nullif(v_ex->>'block_type', ''), 'straight_set'), coalesce(nullif(v_ex->>'group_id', ''), gen_random_uuid()::text))
        returning id into v_new_id;
        v_new := v_new || v_new_id;
        v_added := v_added || jsonb_build_object('id', v_new_id, 'name', v_name);
      end if;
    end loop;

    -- Retire anything active in this program that the draft doesn't carry over.
    for v_cur in select * from exercises where program_id = v_prog.id and retired_at is null and not (id = any (v_keep || v_new)) loop
      update exercises set retired_at = now(), retired_reason = 'Removed in phase "' || v_phase.phase || '"' where id = v_cur.id;
      v_retired := v_retired || jsonb_build_object('id', v_cur.id, 'name', v_cur.name);
    end loop;

    v_changes := jsonb_build_object('kept', v_kept, 'updated', v_updated, 'replaced', v_replaced, 'added', v_added, 'retired', v_retired);

    update programs set phase = v_phase.phase, phase_updated_at = now(), phase_week_start = v_phase.week_start, phase_week_end = v_phase.week_end where id = v_prog.id;
    insert into program_phase_history (program_id, client_id, phase, phase_note, changed_by, week_start, week_end)
    values (v_prog.id, v_prog.client_id, v_phase.phase, 'Phase transition: draft activated', auth.uid()::text, v_phase.week_start, v_phase.week_end);
    update phase_prescription_drafts set status = 'approved', updated_at = now() where phase_id = p_phase_id;
    insert into phase_transitions (program_id, client_id, phase_id, from_phase, to_phase, from_week_start, from_week_end, changes, exit_criteria_override, override_note, applied_by)
    values (v_prog.id, v_prog.client_id, p_phase_id, v_prog.phase, v_phase.phase, v_prog.phase_week_start, v_prog.phase_week_end, v_changes, v_incomplete > 0, nullif(btrim(coalesce(p_override_note, '')), ''), auth.uid())
    returning id into v_trans_id;

    v_result := jsonb_build_object('dry_run', p_dry_run, 'transition_id', case when p_dry_run then null else v_trans_id end,
      'from_phase', v_prog.phase, 'to_phase', v_phase.phase, 'incomplete_exit_criteria', v_incomplete, 'changes', v_changes);

    -- Dry run: everything above is real, then rolled back by this handled error.
    if p_dry_run then raise exception using errcode = 'P0001', message = 'v12_dry_run_rollback'; end if;
  exception when raise_exception then
    if sqlerrm = 'v12_dry_run_rollback' then return v_result; end if;
    raise;
  end;
  return v_result;
end $$;

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

  -- Previously AI-generated exercises. Ones with logged sets are never deleted
  -- (that would cascade-delete the client's history): the coach chooses which to
  -- KEEP in the program (p_keep_exercise_ids); the rest are RETIRED — they leave
  -- the client's workout screen but their logs stay on record. When no choice is
  -- passed (null) every logged exercise is kept. Unlogged AI exercises are replaced.
  update exercises set program_id = new_program_id
   where client_id = d.client_id and source = 'ai' and retired_at is null
     and exists (select 1 from workout_logs l where l.exercise_id = exercises.id)
     and (p_keep_exercise_ids is null or id = any (p_keep_exercise_ids));
  update exercises set retired_at = now(), retired_reason = 'Replaced when the coach approved a new program'
   where client_id = d.client_id and source = 'ai' and retired_at is null
     and exists (select 1 from workout_logs l where l.exercise_id = exercises.id)
     and p_keep_exercise_ids is not null and not (id = any (p_keep_exercise_ids));
  delete from exercises
   where client_id = d.client_id and source = 'ai' and retired_at is null
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
