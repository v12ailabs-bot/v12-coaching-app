-- Food library + ingredient-level meal logging.
--
-- `foods` is a one-way mirror of the Notion "V12 Food Library" (Notion is the
-- source of truth; see scripts/sync-food-library.mjs). Values are per 100 g of
-- the stated state. NULL nutrient = unknown, 0 = a real sourced zero — never
-- coerced. Foods are never deleted, only deactivated.
--
-- `meal_log_entries` is one row per logged ingredient. Each row snapshots the
-- food's identity + per-100 g values at log time and stores the computed
-- nutrients, so later library edits never change history. `meal_logs` (the
-- existing per-slot row every reader already uses) is kept as the SUM of its
-- entries by trigger, so no existing reader has to change.
--
-- Additive and idempotent; safe to re-run. Apply via the Supabase SQL Editor.

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------- foods ----
create table if not exists foods (
  id uuid primary key default gen_random_uuid(),
  food_code text not null unique,             -- Notion Unique ID, e.g. "FD-41"
  notion_page_id uuid not null unique,
  name text not null,
  record_type text,                           -- Ingredient | Prepared dish | Packaged product
  category text,
  aliases text[] not null default '{}',       -- parsed from "Local names / search terms"
  region_tags text[] not null default '{}',
  brand text,
  state text,                                 -- Raw | Dry | Cooked | Canned | Ready-to-eat / as sold
  cooking_method text,
  canned_liquid text,                         -- Drained | Undrained
  preparation_notes text,
  kcal_per_100g numeric(7,2),
  protein_per_100g numeric(7,2),
  carbs_per_100g numeric(7,2),
  fat_per_100g numeric(7,2),
  source_type text,
  source_reference text,
  source_food_description text,
  source_url text,
  source_accessed date,
  match_quality text,
  verification_status text,
  verified_on date,
  is_active boolean not null default true,
  is_published boolean not null default false,
  nutrition_version int not null default 1,
  content_hash text,
  dedupe_key text,
  search_text text not null default '',
  notion_last_edited_at timestamptz,
  synced_at timestamptz not null default now(),
  counterpart_food_id uuid references foods (id) on delete set null,
  replaced_by_food_id uuid references foods (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Safety net behind the sync's own validation: a published food must be
  -- Verified with all four nutrients present and physically plausible.
  constraint foods_published_requires_valid check (
    not is_published or (
      verification_status = 'Verified'
      and kcal_per_100g is not null and protein_per_100g is not null
      and carbs_per_100g is not null and fat_per_100g is not null
      and kcal_per_100g >= 0 and protein_per_100g >= 0
      and carbs_per_100g >= 0 and fat_per_100g >= 0
      and protein_per_100g + carbs_per_100g + fat_per_100g <= 100
      and kcal_per_100g <= 900
    )
  )
);

create unique index if not exists idx_foods_dedupe_active on foods (dedupe_key) where is_active and dedupe_key is not null;
create index if not exists idx_foods_search_trgm on foods using gin (search_text gin_trgm_ops);
create index if not exists idx_foods_published on foods (is_published, is_active);

-- Maintains search_text and bumps nutrition_version when any of the four
-- nutrient values changes (null-safe: NULL -> 0 counts as a change).
create or replace function public.foods_before_write()
returns trigger language plpgsql as $$
begin
  new.search_text := lower(coalesce(new.name, '') || ' ' || coalesce(array_to_string(new.aliases, ' '), '') || ' ' || coalesce(new.brand, ''));
  if tg_op = 'INSERT' then
    new.nutrition_version := 1;
  elsif (new.kcal_per_100g, new.protein_per_100g, new.carbs_per_100g, new.fat_per_100g)
        is distinct from (old.kcal_per_100g, old.protein_per_100g, old.carbs_per_100g, old.fat_per_100g) then
    new.nutrition_version := old.nutrition_version + 1;
  else
    new.nutrition_version := old.nutrition_version;
  end if;
  return new;
end $$;

drop trigger if exists trg_foods_before_write on foods;
create trigger trg_foods_before_write before insert or update on foods
  for each row execute function public.foods_before_write();

-- ------------------------------------------------------- food_versions ----
-- Append-only history of a food's nutrient values. A row is written on insert
-- and whenever nutrition_version changes.
create table if not exists food_versions (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references foods (id) on delete restrict,
  nutrition_version int not null,
  kcal_per_100g numeric(7,2),
  protein_per_100g numeric(7,2),
  carbs_per_100g numeric(7,2),
  fat_per_100g numeric(7,2),
  source_type text,
  source_reference text,
  valid_from timestamptz not null default now(),
  unique (food_id, nutrition_version)
);

create or replace function public.foods_after_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.nutrition_version is distinct from old.nutrition_version then
    insert into food_versions (food_id, nutrition_version, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, source_type, source_reference)
    values (new.id, new.nutrition_version, new.kcal_per_100g, new.protein_per_100g, new.carbs_per_100g, new.fat_per_100g, new.source_type, new.source_reference)
    on conflict (food_id, nutrition_version) do nothing;
  end if;
  return null;
end $$;

drop trigger if exists trg_foods_after_write on foods;
create trigger trg_foods_after_write after insert or update on foods
  for each row execute function public.foods_after_write();

create or replace function public.food_versions_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'food_versions is append-only';
end $$;
drop trigger if exists trg_food_versions_no_mutation on food_versions;
create trigger trg_food_versions_no_mutation before update or delete on food_versions
  for each row execute function public.food_versions_append_only();

-- ------------------------------------------------------ food_sync_runs ----
create table if not exists food_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  mode text not null default 'incremental',   -- incremental | full
  dry_run boolean not null default false,
  created_count int not null default 0,
  updated_count int not null default 0,
  unchanged_count int not null default 0,
  deactivated_count int not null default 0,
  failed_count int not null default 0,
  errors jsonb not null default '[]'::jsonb
);

-- --------------------------------------------------- meal_log_entries ----
create table if not exists meal_log_entries (
  id uuid primary key default gen_random_uuid(),
  meal_log_id uuid not null references meal_logs (id) on delete cascade,
  client_id uuid not null references profiles (id) on delete cascade,
  food_id uuid references foods (id) on delete restrict,        -- null = quick-add / manual
  food_version_id uuid references food_versions (id) on delete restrict,
  quantity_g numeric(8,2) check (quantity_g is null or quantity_g > 0),
  -- snapshot at log time (never re-read from the library)
  food_name text not null,
  state text,
  cooking_method text,
  canned_liquid text,
  kcal_per_100g numeric(7,2),
  protein_per_100g numeric(7,2),
  carbs_per_100g numeric(7,2),
  fat_per_100g numeric(7,2),
  source_type text,
  -- computed at log time; what every total sums
  kcal numeric(9,2),
  protein_g numeric(9,2),
  carbs_g numeric(9,2),
  fat_g numeric(9,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- a food-library entry always has a quantity; only quick-add may omit it
  constraint meal_log_entries_food_needs_qty check (food_id is null or quantity_g is not null)
);

create index if not exists idx_meal_log_entries_meal_log on meal_log_entries (meal_log_id);
create index if not exists idx_meal_log_entries_client on meal_log_entries (client_id);

-- food_versions is coach-read-only under RLS, so the lookup of "which version
-- am I snapshotting" goes through a definer function that returns only an id.
create or replace function public.food_version_id_for(fid uuid, ver int)
returns uuid language sql stable security definer set search_path = public as $$
  select id from food_versions where food_id = fid and nutrition_version = ver;
$$;

-- BEFORE INSERT/UPDATE: snapshot + compute. Runs as the caller (security
-- invoker) on purpose so RLS on `foods` applies — a client can only log a food
-- that is published and active. Snapshot values supplied by the client for a
-- library entry are ignored; they cannot forge nutrition.
create or replace function public.meal_log_entries_before_write()
returns trigger language plpgsql as $$
declare
  f foods%rowtype;
  mclient uuid;
begin
  select client_id into mclient from meal_logs where id = new.meal_log_id;
  if mclient is null or mclient <> new.client_id then
    raise exception 'meal_log_entries.client_id must match the owning meal_logs row';
  end if;

  if tg_op = 'INSERT' and new.food_id is not null then
    select * into f from foods where id = new.food_id;
    if not found then
      raise exception 'food % is not available for logging', new.food_id;
    end if;
    new.food_name := f.name;
    new.state := f.state;
    new.cooking_method := f.cooking_method;
    new.canned_liquid := f.canned_liquid;
    new.kcal_per_100g := f.kcal_per_100g;
    new.protein_per_100g := f.protein_per_100g;
    new.carbs_per_100g := f.carbs_per_100g;
    new.fat_per_100g := f.fat_per_100g;
    new.source_type := f.source_type;
    new.food_version_id := public.food_version_id_for(f.id, f.nutrition_version);
  elsif tg_op = 'UPDATE' then
    -- identity + snapshot are immutable; only the quantity (or, for quick-add,
    -- the totals) can change.
    new.meal_log_id := old.meal_log_id;
    new.client_id := old.client_id;
    new.food_id := old.food_id;
    new.food_version_id := old.food_version_id;
    new.food_name := case when old.food_id is null then new.food_name else old.food_name end;
    new.state := old.state; new.cooking_method := old.cooking_method; new.canned_liquid := old.canned_liquid;
    new.kcal_per_100g := old.kcal_per_100g; new.protein_per_100g := old.protein_per_100g;
    new.carbs_per_100g := old.carbs_per_100g; new.fat_per_100g := old.fat_per_100g;
    new.source_type := old.source_type;
    new.updated_at := now();
  end if;

  -- Compute from the entry's OWN snapshot: grams * per100 / 100, numeric
  -- (exact decimal), rounded half up to 2 dp. NULL per-100 -> NULL result.
  if new.quantity_g is not null and new.food_id is not null then
    new.kcal      := round(new.kcal_per_100g    * new.quantity_g / 100, 2);
    new.protein_g := round(new.protein_per_100g * new.quantity_g / 100, 2);
    new.carbs_g   := round(new.carbs_per_100g   * new.quantity_g / 100, 2);
    new.fat_g     := round(new.fat_per_100g     * new.quantity_g / 100, 2);
  end if;
  return new;
end $$;

drop trigger if exists trg_meal_log_entries_before_write on meal_log_entries;
create trigger trg_meal_log_entries_before_write before insert or update on meal_log_entries
  for each row execute function public.meal_log_entries_before_write();

-- AFTER any change: keep meal_logs (the per-slot totals every existing reader
-- uses) equal to the sum of that slot's entries. If a legacy manual-total row
-- gets its first entry, the manual numbers are preserved as a quick-add entry
-- instead of being overwritten.
create or replace function public.meal_log_entries_sync_totals()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  mid uuid := coalesce(new.meal_log_id, old.meal_log_id);
  ml meal_logs%rowtype;
  n int;
begin
  select * into ml from meal_logs where id = mid;
  if not found then return null; end if;

  if tg_op = 'INSERT' then
    select count(*) into n from meal_log_entries where meal_log_id = mid;
    if n = 1 and (ml.calories is not null or ml.protein_g is not null or ml.carbs_g is not null or ml.fats_g is not null) then
      insert into meal_log_entries (meal_log_id, client_id, food_name, kcal, protein_g, carbs_g, fat_g)
      values (mid, ml.client_id, 'Manual entry', ml.calories, ml.protein_g, ml.carbs_g, ml.fats_g);
    end if;
  end if;

  update meal_logs set
    calories  = (select sum(kcal)      from meal_log_entries where meal_log_id = mid),
    protein_g = (select sum(protein_g) from meal_log_entries where meal_log_id = mid),
    carbs_g   = (select sum(carbs_g)   from meal_log_entries where meal_log_id = mid),
    fats_g    = (select sum(fat_g)     from meal_log_entries where meal_log_id = mid)
  where id = mid;
  return null;
end $$;

drop trigger if exists trg_meal_log_entries_sync_totals on meal_log_entries;
create trigger trg_meal_log_entries_sync_totals after insert or update or delete on meal_log_entries
  for each row execute function public.meal_log_entries_sync_totals();

-- ------------------------------------------------------------- search ----
-- Debounced client search hits this; it never returns the whole library.
-- security invoker: RLS on foods limits clients to published + active rows.
create or replace function public.search_foods(q text, rec_type text default null, region text default null, lim int default 25)
returns setof foods language sql stable as $$
  select * from foods
  where is_published and is_active
    and search_text ilike '%' || lower(trim(q)) || '%'
    and (rec_type is null or record_type = rec_type)
    and (region is null or region = any (region_tags))
  order by (lower(name) like lower(trim(q)) || '%') desc, similarity(search_text, lower(trim(q))) desc, name
  limit least(coalesce(lim, 25), 50);
$$;

-- ---------------------------------------------------------------- RLS ----
alter table foods enable row level security;
drop policy if exists foods_select on foods;
create policy foods_select on foods for select to authenticated
  using ((is_published and is_active) or public.is_coach());

alter table food_versions enable row level security;
drop policy if exists food_versions_select on food_versions;
create policy food_versions_select on food_versions for select to authenticated using (public.is_coach());

alter table food_sync_runs enable row level security;
drop policy if exists food_sync_runs_select on food_sync_runs;
create policy food_sync_runs_select on food_sync_runs for select to authenticated using (public.is_coach());
-- No insert/update/delete policies on the three tables above: only the
-- service role (sync job) writes them.

alter table meal_log_entries enable row level security;
drop policy if exists meal_log_entries_select on meal_log_entries;
create policy meal_log_entries_select on meal_log_entries for select using (client_id = auth.uid() or public.is_coach());
drop policy if exists meal_log_entries_modify on meal_log_entries;
create policy meal_log_entries_modify on meal_log_entries for all using (client_id = auth.uid()) with check (client_id = auth.uid());
