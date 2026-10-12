-- (1) Real program settings, and (2) append-only progression-method history.
-- Idempotent; additive; safe to re-run. Apply via the Supabase SQL Editor.
-- Requires add_program_phases.sql (program_phases), and add_progression_engine.sql
-- (exercises.progression_method / progression_config).

-- ============================== 1) PROGRAM SETTINGS ==============================
-- All default to TODAY'S behaviour, so nothing changes until a coach flips one.
--  show_roadmap_to_client      false -> the client can't read the program's roadmap
--                              (enforced in the database, not just hidden in the UI)
--  progress_tracking_enabled   false -> the client's progress screens (Progress page,
--                              goal status ring, milestone bars) are hidden; data is
--                              still collected and the coach still sees everything
--  client_can_edit_checkins    false -> the client can only write TODAY's (and, for
--                              timezone slack, yesterday's) daily check-in and THIS
--                              week's weekly check-in: no backdating, no editing past
--                              entries. Today's entry stays editable because the Today
--                              screen saves habits/weight into it throughout the day.
alter table programs add column if not exists show_roadmap_to_client boolean not null default true;
alter table programs add column if not exists progress_tracking_enabled boolean not null default true;
alter table programs add column if not exists client_can_edit_checkins boolean not null default true;

create or replace function client_allows_checkin_edits(p_client uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select client_can_edit_checkins from programs where client_id = p_client order by created_at desc limit 1), true)
$$;

create or replace function checkins_guard_past_edits() returns trigger language plpgsql as $$
declare
  v_weekly boolean := (tg_table_name = 'weekly_checkins');
  v_min date;
  v_date date := case when tg_op = 'DELETE' then old.date else new.date end;
  v_client uuid := case when tg_op = 'DELETE' then old.client_id else new.client_id end;
begin
  -- Coaches, the service role (auth.uid() is null) and clients whose coach allows edits are unrestricted.
  if auth.uid() is null or public.is_coach() or client_allows_checkin_edits(v_client) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  v_min := (now() at time zone 'utc')::date - case when v_weekly then 7 else 1 end;
  if v_date < v_min then
    raise exception 'Your coach has turned off editing past check-ins. You can only update the current %.', case when v_weekly then 'week' else 'day' end;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists trg_daily_checkins_guard on daily_checkins;
create trigger trg_daily_checkins_guard before insert or update or delete on daily_checkins for each row execute function checkins_guard_past_edits();
drop trigger if exists trg_weekly_checkins_guard on weekly_checkins;
create trigger trg_weekly_checkins_guard before insert or update or delete on weekly_checkins for each row execute function checkins_guard_past_edits();

-- Roadmap visibility enforced at the data layer. A client reads their own phases
-- only while the program's show_roadmap_to_client is true; coaches always can.
drop policy if exists program_phases_select on program_phases;
create policy program_phases_select on program_phases for select using (
  public.is_coach()
  or (client_id = auth.uid() and coalesce((select p.show_roadmap_to_client from programs p where p.id = program_phases.program_id), true))
);

-- ======================= 2) PROGRESSION METHOD HISTORY ==========================
-- Every change of an exercise's progression method/settings is recorded: what it
-- was, what it became, why, from when, and the progression state it replaced.
-- Logged workout history is never touched or re-interpreted. Append-only.
create table if not exists progression_method_history (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references exercises (id) on delete cascade,
  client_id uuid not null,
  from_method text,
  to_method text,
  from_config jsonb not null default '{}',
  to_config jsonb not null default '{}',
  method_changed boolean not null,
  reason text,
  effective_date date not null default current_date,
  previous_state jsonb not null default '{}',   -- e.g. the prescribed target in force when it changed
  changed_by uuid,
  changed_at timestamptz not null default now()
);
create index if not exists idx_prog_method_history_ex on progression_method_history (exercise_id, changed_at desc);
alter table progression_method_history enable row level security;
drop policy if exists prog_method_history_select on progression_method_history;
create policy prog_method_history_select on progression_method_history for select using (public.is_coach());
drop policy if exists prog_method_history_insert on progression_method_history;
create policy prog_method_history_insert on progression_method_history for insert with check (public.is_coach());
-- no update/delete policy: history can't be rewritten from the app

-- One transaction: record the change AND apply it. Changing the METHOD requires a
-- reason; adjusting settings of the same method doesn't. The exercise's current
-- target weight is left in place (it is the client's live target) and recorded as
-- the previous state; the coach decides what the new method's starting point is.
create or replace function assign_progression_method(p_exercise_id uuid, p_method text, p_config jsonb, p_reason text default null, p_effective date default current_date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e exercises%rowtype;
  v_changed boolean;
  v_config jsonb := coalesce(p_config, '{}'::jsonb);
begin
  if not public.is_coach() then raise exception 'Only a coach can change a progression method.'; end if;
  select * into e from exercises where id = p_exercise_id for update;
  if not found then raise exception 'Exercise not found.'; end if;
  v_changed := e.progression_method is distinct from nullif(btrim(coalesce(p_method, '')), '');
  if v_changed and coalesce(btrim(p_reason), '') = '' then raise exception 'A reason is required when changing the progression method.'; end if;
  if not v_changed and e.progression_config is not distinct from v_config then
    return jsonb_build_object('changed', false);   -- nothing to record
  end if;
  insert into progression_method_history (exercise_id, client_id, from_method, to_method, from_config, to_config, method_changed, reason, effective_date, previous_state, changed_by)
  values (e.id, e.client_id, e.progression_method, nullif(btrim(coalesce(p_method, '')), ''), coalesce(e.progression_config, '{}'::jsonb), v_config, v_changed,
          nullif(btrim(coalesce(p_reason, '')), ''), coalesce(p_effective, current_date),
          jsonb_build_object('prescribed_weight', e.prescribed_weight, 'prescribed_set_at', e.prescribed_set_at), auth.uid());
  update exercises set progression_method = nullif(btrim(coalesce(p_method, '')), ''), progression_config = v_config where id = e.id;
  return jsonb_build_object('changed', true, 'method_changed', v_changed);
end $$;
grant execute on function assign_progression_method(uuid, text, jsonb, text, date) to authenticated;
grant execute on function client_allows_checkin_edits(uuid) to authenticated;
