create table if not exists saved_meals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles (id) on delete cascade,
  name text not null,
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fats_g numeric,
  created_at timestamptz not null default now()
);
create index if not exists idx_saved_meals_client on saved_meals (client_id);
alter table saved_meals enable row level security;
drop policy if exists saved_meals_select on saved_meals;
create policy saved_meals_select on saved_meals for select using (client_id = auth.uid() or public.is_coach());
drop policy if exists saved_meals_modify on saved_meals;
create policy saved_meals_modify on saved_meals for all using (client_id = auth.uid()) with check (client_id = auth.uid());
