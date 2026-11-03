-- Lets a coach declare that two exercise names are the same lift for strength memory
-- (e.g. "Barbell Back Squat" = "Back Squat"): merges their records and remembers the
-- link so future logged sets under either name feed ONE record.
-- Run AFTER add_strength_memory.sql. Idempotent; safe to re-run.

create table if not exists client_strength_aliases (
  client_id uuid not null references profiles (id) on delete cascade,
  alias_key text not null,
  canonical_key text not null,
  primary key (client_id, alias_key)
);
alter table client_strength_aliases enable row level security;
drop policy if exists strength_aliases_select on client_strength_aliases;
create policy strength_aliases_select on client_strength_aliases for select using (public.is_coach() or client_id = auth.uid());
drop policy if exists strength_aliases_coach_write on client_strength_aliases;
create policy strength_aliases_coach_write on client_strength_aliases for all using (public.is_coach()) with check (public.is_coach());

-- Same trigger as before, but the record key goes through the alias table, and the
-- display name is no longer overwritten by whichever spelling was logged last.
create or replace function public.strength_memory_record() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ex exercises%rowtype;
  k text;
begin
  if coalesce(new.set_type, 'working') <> 'working' then return new; end if;
  if new.weight is null and new.reps is null then return new; end if;
  select * into ex from exercises where id = new.exercise_id;
  if not found or new.client_id is null then return new; end if;
  k := strength_exercise_key(ex.name);
  k := coalesce((select canonical_key from client_strength_aliases a where a.client_id = new.client_id and a.alias_key = k), k);

  insert into client_strength_records as r
    (client_id, exercise_key, exercise_name, is_bodyweight, best_weight, best_weight_reps, best_weight_date, best_reps,
     last_weight, last_reps, last_date, first_date)
  values
    (new.client_id, k, btrim(ex.name), coalesce(ex.is_bodyweight, false),
     new.weight, new.reps, case when new.weight is not null then new.date end, new.reps,
     new.weight, new.reps, new.date, new.date)
  on conflict (client_id, exercise_key) do update set
    best_weight_reps = case when excluded.best_weight is not null and (r.best_weight is null or excluded.best_weight > r.best_weight
                              or (excluded.best_weight = r.best_weight and coalesce(excluded.best_weight_reps, 0) > coalesce(r.best_weight_reps, 0)))
                            then excluded.best_weight_reps else r.best_weight_reps end,
    best_weight_date = case when excluded.best_weight is not null and (r.best_weight is null or excluded.best_weight > r.best_weight
                              or (excluded.best_weight = r.best_weight and coalesce(excluded.best_weight_reps, 0) > coalesce(r.best_weight_reps, 0)))
                            then excluded.best_weight_date else r.best_weight_date end,
    best_weight = greatest(r.best_weight, excluded.best_weight),
    best_reps = greatest(r.best_reps, excluded.best_reps),
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

-- Merge record p_from into p_into (same client): keeps the better best, the more recent last,
-- the earlier first date; deletes the source record; remembers the link (and repoints any
-- earlier links that pointed at the source). Coach only.
create or replace function public.merge_strength_records(p_client uuid, p_from_key text, p_into_key text)
returns void language plpgsql security definer set search_path = public as $$
declare f client_strength_records%rowtype; t client_strength_records%rowtype;
begin
  if not public.is_coach() then raise exception 'Only a coach can merge strength records.'; end if;
  if p_from_key = p_into_key then raise exception 'Pick a different lift to merge into.'; end if;
  select * into f from client_strength_records where client_id = p_client and exercise_key = p_from_key for update;
  select * into t from client_strength_records where client_id = p_client and exercise_key = p_into_key for update;
  if t.id is null then raise exception 'The record to merge into was not found.'; end if;
  if f.id is not null then
    update client_strength_records set
      best_weight_reps = case when f.best_weight is not null and (t.best_weight is null or f.best_weight > t.best_weight or (f.best_weight = t.best_weight and coalesce(f.best_weight_reps,0) > coalesce(t.best_weight_reps,0))) then f.best_weight_reps else t.best_weight_reps end,
      best_weight_date = case when f.best_weight is not null and (t.best_weight is null or f.best_weight > t.best_weight or (f.best_weight = t.best_weight and coalesce(f.best_weight_reps,0) > coalesce(t.best_weight_reps,0))) then f.best_weight_date else t.best_weight_date end,
      best_weight = greatest(t.best_weight, f.best_weight),
      best_reps = greatest(t.best_reps, f.best_reps),
      last_weight = case when f.last_date > t.last_date or t.last_date is null then f.last_weight else t.last_weight end,
      last_reps = case when f.last_date > t.last_date or t.last_date is null then f.last_reps else t.last_reps end,
      last_date = greatest(t.last_date, f.last_date),
      first_date = least(t.first_date, f.first_date),
      updated_at = now()
    where id = t.id;
    delete from client_strength_records where id = f.id;
  end if;
  update client_strength_aliases set canonical_key = p_into_key where client_id = p_client and canonical_key = p_from_key;
  insert into client_strength_aliases (client_id, alias_key, canonical_key) values (p_client, p_from_key, p_into_key)
    on conflict (client_id, alias_key) do update set canonical_key = excluded.canonical_key;
end $$;
revoke all on function public.merge_strength_records(uuid, text, text) from public;
grant execute on function public.merge_strength_records(uuid, text, text) to authenticated;
