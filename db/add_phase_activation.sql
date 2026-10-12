-- Slice 4 part 2: activate a phase draft (phase_prescription_drafts) as the
-- client's real workouts, atomically, with a dry-run preview and an undo.
-- Requires add_exercise_retired_at.sql and add_phase_prescription_drafts.sql.
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.
--
-- Rules (each is what keeps history intact):
--  * Nothing is ever DELETED from exercises (exercises -> workout_logs cascades).
--    Exercises leaving the plan are RETIRED (retired_at), so logs/charts remain.
--  * Draft row with source_exercise_id, same name, same sets/reps/day -> untouched.
--  * Same name but different sets/reps/day -> updated IN PLACE (history continues).
--  * Different name -> old one retired, new one inserted in its slot (keeps
--    group_id/category/order); progression settings do not carry over.
--  * Draft row with no (still-active) source -> inserted as a new exercise.
--  * Active program exercises not referenced by the draft -> retired.
--  * Everything happens in ONE function call = one transaction: it fully
--    applies or fully doesn't.
--  * If the CURRENT phase has incomplete exit criteria an override note is
--    REQUIRED, and is stored on the transition record.
--  * Coach-only (checked inside the function).

create table if not exists phase_transitions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs (id) on delete cascade,
  client_id uuid not null references profiles (id) on delete cascade,
  phase_id uuid not null references program_phases (id) on delete cascade,
  from_phase text,
  to_phase text not null,
  from_week_start int,
  from_week_end int,
  changes jsonb not null,
  exit_criteria_override boolean not null default false,
  override_note text,
  status text not null default 'applied' check (status in ('applied', 'undone')),
  applied_by uuid references profiles (id) on delete set null,
  applied_at timestamptz not null default now(),
  undone_by uuid references profiles (id) on delete set null,
  undone_at timestamptz,
  undo_note text
);
create index if not exists idx_phase_transitions_program on phase_transitions (program_id, applied_at desc);
alter table phase_transitions enable row level security;
drop policy if exists phase_transitions_coach on phase_transitions;
create policy phase_transitions_coach on phase_transitions for all using (public.is_coach()) with check (public.is_coach());

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
        if not found then v_src := null; end if; -- source is gone or retired: treat as new
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

create or replace function undo_phase_transition(p_transition_id uuid, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t phase_transitions%rowtype;
  u jsonb;
  r jsonb;
begin
  if not public.is_coach() then raise exception 'Only a coach can undo a phase transition.'; end if;
  select * into t from phase_transitions where id = p_transition_id for update;
  if not found then raise exception 'Transition not found.'; end if;
  if t.status <> 'applied' then raise exception 'This transition was already undone.'; end if;
  if exists (select 1 from phase_transitions where program_id = t.program_id and status = 'applied' and applied_at > t.applied_at) then
    raise exception 'A later phase transition exists for this program; undo that one first.';
  end if;

  -- Put updated exercises back as they were.
  for u in select value from jsonb_array_elements(t.changes->'updated') loop
    update exercises set sets = nullif(u->'before'->>'sets', '')::int, reps = nullif(u->'before'->>'reps', ''), day_of_week = nullif(u->'before'->>'day_of_week', '')
    where id = (u->>'id')::uuid;
  end loop;
  -- Retire what the transition added (never delete: logs may already exist on them).
  update exercises set retired_at = now(), retired_reason = 'Phase transition undone'
  where id in (select (x->>'id')::uuid from jsonb_array_elements(t.changes->'added') x)
     or id in (select (x->>'new')::uuid from jsonb_array_elements(t.changes->'replaced') x);
  -- Bring back what it retired or replaced.
  update exercises set retired_at = null, retired_reason = null
  where id in (select (x->>'id')::uuid from jsonb_array_elements(t.changes->'retired') x)
     or id in (select (x->>'old')::uuid from jsonb_array_elements(t.changes->'replaced') x);

  update programs set phase = t.from_phase, phase_updated_at = now(), phase_week_start = t.from_week_start, phase_week_end = t.from_week_end where id = t.program_id;
  insert into program_phase_history (program_id, client_id, phase, phase_note, changed_by, week_start, week_end)
  values (t.program_id, t.client_id, coalesce(t.from_phase, ''), 'Phase transition undone', auth.uid()::text, t.from_week_start, t.from_week_end);
  update phase_prescription_drafts set status = 'draft', updated_at = now() where phase_id = t.phase_id;
  update phase_transitions set status = 'undone', undone_by = auth.uid(), undone_at = now(), undo_note = nullif(btrim(coalesce(p_note, '')), '') where id = t.id;
  return jsonb_build_object('transition_id', t.id, 'restored_phase', t.from_phase);
end $$;

grant execute on function activate_phase_draft(uuid, text, boolean) to authenticated;
grant execute on function undo_phase_transition(uuid, text) to authenticated;
