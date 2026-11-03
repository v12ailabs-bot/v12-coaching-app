-- A coach-verified 1RM per lift, stored on the client's strength record (keyed by exercise NAME, so it survives
-- program changes, exercise swaps and deletes). Used to pre-fill percentage-based / conjugate calculations.
-- The app never estimates a 1RM: this is only ever a number a coach entered. Run AFTER add_strength_memory_aliases.sql.
-- Idempotent; safe to re-run.
alter table client_strength_records add column if not exists verified_1rm numeric check (verified_1rm is null or verified_1rm > 0);
alter table client_strength_records add column if not exists verified_1rm_date date;

-- Merging two names for one lift keeps the most recently verified 1RM.
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
      verified_1rm = case when f.verified_1rm_date is not null and (t.verified_1rm_date is null or f.verified_1rm_date > t.verified_1rm_date) then f.verified_1rm else t.verified_1rm end,
      verified_1rm_date = greatest(t.verified_1rm_date, f.verified_1rm_date),
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
