-- Strength memory: a per-client, per-exercise record of what they have lifted,
-- that SURVIVES the exercise being deleted.
-- Why: workout_logs.exercise_id is ON DELETE CASCADE, so removing an exercise (the
-- coach's Remove button, restoring an older program version, ...) erased the only
-- record of what the client could do. This table is keyed by client + normalised
-- exercise NAME (not the exercise id), is kept current by a trigger on workout_logs,
-- and is never touched by deleting an exercise or its logs.
-- Idempotent; additive; safe to re-run. Apply via the Supabase SQL Editor.

create or replace function public.strength_exercise_key(p_name text) returns text
language sql immutable as $$ select lower(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g')) $$;

create table if not exists client_strength_records (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles (id) on delete cascade,
  exercise_key text not null,            -- strength_exercise_key(name)
  exercise_name text not null,           -- display name (latest spelling seen)
  is_bodyweight boolean not null default false,
  best_weight numeric,                   -- heaviest working set ever logged
  best_weight_reps int,                  -- reps on that set
  best_weight_date date,
  best_reps int,                         -- most reps in any working set
  last_weight numeric,                   -- top working set of the most recent session
  last_reps int,
  last_date date,
  first_date date,
  updated_at timestamptz not null default now(),
  unique (client_id, exercise_key)
);
create index if not exists idx_strength_records_client on client_strength_records (client_id);

alter table client_strength_records enable row level security;
drop policy if exists strength_records_select on client_strength_records;
create policy strength_records_select on client_strength_records for select using (public.is_coach() or client_id = auth.uid());
-- Only the trigger (security definer) writes automatically; a coach can correct a bad entry (e.g. a typo'd 2250 lb).
drop policy if exists strength_records_coach_write on client_strength_records;
create policy strength_records_coach_write on client_strength_records for all using (public.is_coach()) with check (public.is_coach());

-- Folds one logged working set into the record. Warm-ups are ignored. Records only ever
-- move FORWARD (best is "ever done"; last is the most recent session), so deleting or
-- editing logs later never lowers what the client has proven.
create or replace function public.strength_memory_record() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ex exercises%rowtype;
begin
  if coalesce(new.set_type, 'working') <> 'working' then return new; end if;
  if new.weight is null and new.reps is null then return new; end if;
  select * into ex from exercises where id = new.exercise_id;
  if not found or new.client_id is null then return new; end if;

  insert into client_strength_records as r
    (client_id, exercise_key, exercise_name, is_bodyweight, best_weight, best_weight_reps, best_weight_date, best_reps,
     last_weight, last_reps, last_date, first_date)
  values
    (new.client_id, strength_exercise_key(ex.name), btrim(ex.name), coalesce(ex.is_bodyweight, false),
     new.weight, new.reps, case when new.weight is not null then new.date end, new.reps,
     new.weight, new.reps, new.date, new.date)
  on conflict (client_id, exercise_key) do update set
    exercise_name = excluded.exercise_name,
    is_bodyweight = excluded.is_bodyweight,
    best_weight_reps = case when excluded.best_weight is not null and (r.best_weight is null or excluded.best_weight > r.best_weight
                              or (excluded.best_weight = r.best_weight and coalesce(excluded.best_weight_reps, 0) > coalesce(r.best_weight_reps, 0)))
                            then excluded.best_weight_reps else r.best_weight_reps end,
    best_weight_date = case when excluded.best_weight is not null and (r.best_weight is null or excluded.best_weight > r.best_weight
                              or (excluded.best_weight = r.best_weight and coalesce(excluded.best_weight_reps, 0) > coalesce(r.best_weight_reps, 0)))
                            then excluded.best_weight_date else r.best_weight_date end,
    best_weight = greatest(r.best_weight, excluded.best_weight),
    best_reps = greatest(r.best_reps, excluded.best_reps),
    -- last = top set of the latest session date: a newer date replaces it; the same date keeps the heavier set.
    last_weight = case when excluded.last_date > r.last_date or r.last_date is null
                         or (excluded.last_date = r.last_date and coalesce(excluded.last_weight, -1) > coalesce(r.last_weight, -1))
                         or (excluded.last_date = r.last_date and coalesce(excluded.last_weight, -1) = coalesce(r.last_weight, -1) and coalesce(excluded.last_reps, 0) > coalesce(r.last_reps, 0))
                       then excluded.last_weight else r.last_weight end,
    last_reps = case when excluded.last_date > r.last_date or r.last_date is null
                         or (excluded.last_date = r.last_date and coalesce(excluded.last_weight, -1) > coalesce(r.last_weight, -1))
                         or (excluded.last_date = r.last_date and coalesce(excluded.last_weight, -1) = coalesce(r.last_weight, -1) and coalesce(excluded.last_reps, 0) > coalesce(r.last_reps, 0))
                       then excluded.last_reps else r.last_reps end,
    last_date = greatest(r.last_date, excluded.last_date),
    first_date = least(r.first_date, excluded.first_date),
    updated_at = now();
  return new;
end $$;

drop trigger if exists trg_workout_logs_strength_memory on workout_logs;
create trigger trg_workout_logs_strength_memory
  after insert or update of weight, reps, date, set_type on workout_logs
  for each row execute function public.strength_memory_record();

-- One-time backfill from everything already logged (does not overwrite existing rows).
with base as (
  select l.client_id, strength_exercise_key(e.name) as k, btrim(e.name) as nm, coalesce(e.is_bodyweight, false) as bw,
         l.weight, l.reps, l.date as d
  from workout_logs l join exercises e on e.id = l.exercise_id
  where coalesce(l.set_type, 'working') = 'working' and (l.weight is not null or l.reps is not null) and l.client_id is not null
), bestw as (
  select distinct on (client_id, k) client_id, k, weight, reps, d from base where weight is not null
  order by client_id, k, weight desc, reps desc nulls last, d desc
), lastl as (
  select distinct on (client_id, k) client_id, k, nm, bw, weight, reps, d from base
  order by client_id, k, d desc, weight desc nulls last, reps desc nulls last
), agg as (
  select client_id, k, max(reps) as max_reps, min(d) as first_d from base group by client_id, k
)
insert into client_strength_records (client_id, exercise_key, exercise_name, is_bodyweight, best_weight, best_weight_reps, best_weight_date, best_reps,
                                     last_weight, last_reps, last_date, first_date)
select l.client_id, l.k, l.nm, l.bw, b.weight, b.reps, b.d, a.max_reps, l.weight, l.reps, l.d, a.first_d
from lastl l join agg a on a.client_id = l.client_id and a.k = l.k
left join bestw b on b.client_id = l.client_id and b.k = l.k
on conflict (client_id, exercise_key) do nothing;
