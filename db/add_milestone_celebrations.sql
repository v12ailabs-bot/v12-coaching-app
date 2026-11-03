-- Automatic milestone / goal-hit detection + client celebration + AI next-step recommendations.
-- Before this, a hit was only detected when a COACH happened to render the Milestones card
-- (recordAchievement in the browser), so nothing could pop up for the client. Now the
-- database marks it the moment the qualifying data is logged.
-- Run AFTER add_milestone_achievement_tracking.sql. Idempotent; safe to re-run.

-- 1) Client-side read state for the congratulations popup (coach_acknowledged_at already exists).
alter table client_goals add column if not exists client_acknowledged_at timestamptz;
-- Everything already marked achieved before this ships must NOT pop up for clients all at once.
update client_goals set client_acknowledged_at = now() where achieved_at is not null and client_acknowledged_at is null;

-- 2) Exercise milestones: a logged WORKING set that clears the target marks it achieved.
--    Matches by exercise name (same key as strength memory). Only counts sets on/after the
--    milestone's baseline date, so old history can't instantly "hit" a freshly created milestone.
create or replace function public.milestone_hit_on_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare ex_name text;
begin
  if coalesce(new.set_type, 'working') <> 'working' or new.client_id is null then return new; end if;
  select name into ex_name from exercises where id = new.exercise_id;
  if ex_name is null then return new; end if;
  update client_goals g set achieved_at = now()
   where g.client_id = new.client_id and g.status = 'active' and g.achieved_at is null
     and g.category in ('strength', 'rep_performance', 'exercise_progression')
     and g.exercise_name is not null
     and strength_exercise_key(g.exercise_name) = strength_exercise_key(ex_name)
     and new.date >= coalesce(g.baseline_date, date '0001-01-01')
     and g.target_value is not null
     and case when lower(coalesce(g.unit, '')) like 'rep%' then new.reps else new.weight end is not null
     and case when g.direction::text = 'decrease'
              then (case when lower(coalesce(g.unit, '')) like 'rep%' then new.reps else new.weight end) <= g.target_value
              else (case when lower(coalesce(g.unit, '')) like 'rep%' then new.reps else new.weight end) >= g.target_value end;
  return new;
end $$;
drop trigger if exists trg_workout_logs_milestone_hit on workout_logs;
create trigger trg_workout_logs_milestone_hit after insert or update of weight, reps, date, set_type on workout_logs
  for each row execute function public.milestone_hit_on_log();

-- 3) The primary bodyweight goal: a check-in weight that reaches the target marks it achieved.
create or replace function public.weight_goal_hit_on_checkin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.weight is null or new.client_id is null then return new; end if;
  update client_goals g set achieved_at = now()
   where g.client_id = new.client_id and g.status = 'active' and g.achieved_at is null
     and g.metric_key = 'bodyweight' and g.target_value is not null
     and new.date >= coalesce(g.baseline_date, date '0001-01-01')
     and case when g.direction::text = 'decrease' then new.weight <= g.target_value
              when g.direction::text = 'increase' then new.weight >= g.target_value
              else false end;
  return new;
end $$;
drop trigger if exists trg_daily_checkins_weight_goal on daily_checkins;
create trigger trg_daily_checkins_weight_goal after insert or update of weight on daily_checkins
  for each row execute function public.weight_goal_hit_on_checkin();

-- 4) A client can mark only THEIR OWN achievements as seen (nothing else on the row).
create or replace function public.acknowledge_my_achievements(p_ids uuid[]) returns void
language sql security definer set search_path = public as $$
  update client_goals set client_acknowledged_at = now() where id = any (p_ids) and client_id = auth.uid() and client_acknowledged_at is null
$$;
revoke all on function public.acknowledge_my_achievements(uuid[]) from public;
grant execute on function public.acknowledge_my_achievements(uuid[]) to authenticated;

-- 5) AI "what next" recommendation for a hit milestone; the coach continues (accepts) or discards it.
create table if not exists milestone_recommendations (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null unique references client_goals (id) on delete cascade,
  client_id uuid not null references profiles (id) on delete cascade,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'discarded')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid
);
alter table milestone_recommendations enable row level security;
drop policy if exists milestone_recs_coach on milestone_recommendations;
create policy milestone_recs_coach on milestone_recommendations for all using (public.is_coach()) with check (public.is_coach());
