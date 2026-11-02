-- Coach-reviewed program drafts, per-exercise rest periods, session-duration
-- settings, and explicit workout completion.
--
-- Additive and idempotent; safe to re-run. Nothing here deletes or rewrites
-- existing rows. Apply via the Supabase SQL Editor.
--
-- 1. exercises.rest_seconds     — prescribed rest between sets (nullable; old rows stay null).
-- 2. programs.session_*         — the duration arrangement the program was built for.
-- 3. program_drafts             — AI output waits here; it only touches programs/exercises
--                                 when a coach approves it (approve_program_draft()).
-- 4. approve_program_draft()    — atomic swap: program updated + exercises replaced and the
--                                 draft marked approved in ONE transaction. Any failure
--                                 rolls everything back, leaving the active program intact.
-- 5. workout_completions        — a client's explicit "I finished this workout" record.

alter table exercises add column if not exists rest_seconds int;
alter table exercises drop constraint if exists exercises_rest_seconds_check;
alter table exercises add constraint exercises_rest_seconds_check check (rest_seconds is null or (rest_seconds between 0 and 900));

alter table programs add column if not exists session_minutes int;
alter table programs add column if not exists session_arrangement text;
alter table programs add column if not exists session_prep text;
alter table programs add column if not exists session_finish text;

create table if not exists program_drafts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles (id) on delete cascade,   -- training owner (shared partners write to the owner)
  profile_id uuid references profiles (id) on delete set null,          -- the client the coach selected
  status text not null default 'draft' check (status in ('draft', 'approved', 'discarded', 'superseded')),
  template_id text,
  template_name text,
  session_config jsonb not null default '{}'::jsonb,
  payload jsonb not null,            -- the plan as the coach currently sees/edits it
  original_payload jsonb not null,   -- the plan exactly as the AI first produced it (never edited)
  revisions jsonb not null default '[]'::jsonb,   -- [{at, kind, day?, instruction?, note?}]
  warnings jsonb not null default '[]'::jsonb,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references profiles (id) on delete set null,
  approved_program_id uuid references programs (id) on delete set null
);
-- At most one open draft per client.
create unique index if not exists idx_program_drafts_one_open on program_drafts (client_id) where status = 'draft';
create index if not exists idx_program_drafts_client on program_drafts (client_id, created_at desc);

alter table program_drafts enable row level security;
drop policy if exists program_drafts_coach on program_drafts;
create policy program_drafts_coach on program_drafts for all using (public.is_coach()) with check (public.is_coach());
-- No client policy: clients never see unapproved drafts.

-- Replaces the 1-argument version from the first release (safe if it doesn't exist).
drop function if exists public.approve_program_draft(uuid);

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

  if d.profile_id is not null then
    update profiles set onboarding_complete = true where id = d.profile_id;
  end if;
  return new_program_id;
end;
$$;
revoke all on function public.approve_program_draft(uuid, uuid[]) from public;
grant execute on function public.approve_program_draft(uuid, uuid[]) to authenticated;

-- A client's explicit "I finished this workout". Logging sets does NOT create one,
-- and the absence of a row means "unreported", never "missed". One per client per
-- date; clients can create but not edit/delete (an existing record is never overwritten).
create table if not exists workout_completions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles (id) on delete cascade,
  date date not null,
  day_of_week text,
  status text not null default 'completed' check (status in ('completed', 'partial')),
  note text,
  sets_logged int,
  completed_at timestamptz not null default now(),
  unique (client_id, date)
);
alter table workout_completions enable row level security;
drop policy if exists workout_completions_select on workout_completions;
create policy workout_completions_select on workout_completions for select using (client_id = auth.uid() or public.is_coach());
drop policy if exists workout_completions_insert on workout_completions;
create policy workout_completions_insert on workout_completions for insert with check (client_id = auth.uid());
drop policy if exists workout_completions_coach_modify on workout_completions;
create policy workout_completions_coach_modify on workout_completions for all using (public.is_coach()) with check (public.is_coach());
