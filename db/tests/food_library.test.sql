-- Local test for db/add_food_library.sql. Run via scripts/test-food-migration.sh
-- (throwaway Postgres in Docker; never touches Supabase).
\set ON_ERROR_STOP on
create role authenticated; create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create table profiles (id uuid primary key, role text default 'client');
create function public.is_coach() returns boolean language sql stable security definer as $$ select exists (select 1 from profiles where id = auth.uid() and role='coach') $$;
create table meal_logs (id uuid primary key default gen_random_uuid(), client_id uuid references profiles(id) on delete cascade, date date not null, meal text not null, calories numeric, protein_g numeric, carbs_g numeric, fats_g numeric, created_at timestamptz default now());
create unique index on meal_logs (client_id, date, meal);
alter table meal_logs enable row level security;
create policy ml on meal_logs for all using (client_id = auth.uid() or public.is_coach()) with check (client_id = auth.uid());
grant usage on schema public, auth to authenticated; grant all on all tables in schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated;

\i /work/db/add_food_library.sql
-- idempotent re-run
\i /work/db/add_food_library.sql
grant all on all tables in schema public to authenticated, service_role;

insert into profiles values ('00000000-0000-0000-0000-00000000000a','client'),('00000000-0000-0000-0000-00000000000b','client'),('00000000-0000-0000-0000-0000000000c0','coach');

create function assert(cond boolean, msg text) returns void language plpgsql as $$ begin if cond is not true then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

-- seed (as service role / owner)
insert into foods (food_code, notion_page_id, name, aliases, state, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, verification_status, is_published, source_type, source_reference, dedupe_key)
values ('FD-1', gen_random_uuid(), 'Chicken breast, skinless, cooked', '{grilled chicken}', 'Cooked', 165, 31, 0, 3.6, 'Verified', true, 'USDA FoodData Central', 'x', 'k1'),
       ('FD-2', gen_random_uuid(), 'Rice, white, dry', '{}', 'Dry', 365, 7.1, 80, 0.7, 'Verified', true, 'USDA FoodData Central', 'x', 'k2');
insert into foods (id, food_code, notion_page_id, name, state, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, verification_status, is_published, dedupe_key)
values ('99999999-9999-9999-9999-999999999999', 'FD-3', gen_random_uuid(), 'Mystery fiber food', 'Raw', 100, 5, null, 1, 'Verified', false, 'k3');
-- published constraint rejects an incomplete Verified row
do $$ begin
  begin update foods set is_published = true where food_code='FD-3'; raise exception 'should have failed'; exception when check_violation then null; end;
end $$;
-- nutrition_version / food_versions
select assert((select nutrition_version from foods where food_code='FD-1') = 1, 'v1 on insert');
select assert((select count(*) from food_versions) = 3, 'one version row per food on insert');
-- no spurious bump for non-nutrient edit
update foods set brand='x' where food_code='FD-1';
select assert((select nutrition_version from foods where food_code='FD-1') = 1, 'no bump on non-nutrient edit');
-- append-only
do $$ begin begin delete from food_versions; raise exception 'should have failed'; exception when raise_exception then if sqlerrm not like '%append-only%' then raise; end if; end; end $$;

set role authenticated;
set test.uid = '00000000-0000-0000-0000-00000000000a';
-- RLS: client sees published only; cannot write foods
select assert((select count(*) from foods) = 2, 'client sees only published foods');
do $$ begin begin update foods set name='hacked'; if found then raise exception 'client updated foods'; end if; exception when insufficient_privilege then null; end; end $$;
select assert((select count(*) from foods where name='hacked') = 0, 'client cannot write foods');
select assert((select count(*) from food_versions) = 0, 'client cannot read food_versions');
-- search
select assert((select count(*) from search_foods('chicken')) = 1, 'search by name');
select assert((select count(*) from search_foods('grilled')) = 1, 'search by alias');
select assert((select count(*) from search_foods('mystery')) = 0, 'unpublished not searchable');

insert into meal_logs (id, client_id, date, meal) values ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000a','2026-10-11','Lunch');
-- 100 g
insert into meal_log_entries (id, meal_log_id, client_id, food_id, quantity_g, kcal)
  select '22222222-2222-2222-2222-222222222221','11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000a', id, 100, 99999 from foods where food_code='FD-1';
select assert((select kcal from meal_log_entries where id='22222222-2222-2222-2222-222222222221') = 165.00, '100 g kcal (client-supplied kcal ignored)');
select assert((select protein_g from meal_log_entries where id='22222222-2222-2222-2222-222222222221') = 31.00, '100 g protein');
-- 137.3 g : 165*1.373=226.545 -> 226.55 (half up); protein 31*1.373=42.563->42.56; fat 3.6*1.373=4.9428->4.94
insert into meal_log_entries (id, meal_log_id, client_id, food_id, quantity_g)
  select '22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000a', id, 137.3 from foods where food_code='FD-1';
select assert((select kcal from meal_log_entries where id='22222222-2222-2222-2222-222222222222') = 226.55, '137.3 g kcal half-up');
select assert((select protein_g from meal_log_entries where id='22222222-2222-2222-2222-222222222222') = 42.56, '137.3 g protein');
select assert((select fat_g from meal_log_entries where id='22222222-2222-2222-2222-222222222222') = 4.94, '137.3 g fat');
select assert((select carbs_g from meal_log_entries where id='22222222-2222-2222-2222-222222222222') = 0.00, 'real zero stays 0');
-- meal total = sum of entries, written to meal_logs
select assert((select calories from meal_logs where id='11111111-1111-1111-1111-111111111111') = 391.55, 'meal_logs.calories = sum(entries)');
-- invalid quantities
do $$ begin begin insert into meal_log_entries (meal_log_id, client_id, food_id, quantity_g) select '11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000a', id, 0 from foods where food_code='FD-1'; raise exception 'zero accepted'; exception when check_violation then null; end; end $$;
do $$ begin begin insert into meal_log_entries (meal_log_id, client_id, food_id, quantity_g) select '11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000a', id, -5 from foods where food_code='FD-1'; raise exception 'negative accepted'; exception when check_violation then null; end; end $$;
-- unpublished food cannot be logged
do $$ begin begin insert into meal_log_entries (meal_log_id, client_id, food_id, quantity_g) select '11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000a', '99999999-9999-9999-9999-999999999999', 50; raise exception 'unpublished accepted'; exception when raise_exception then if sqlerrm not like '%not available%' then raise; end if; end; end $$;
-- cannot log into someone else's meal_log
do $$ begin begin insert into meal_log_entries (meal_log_id, client_id, food_id, quantity_g) select '11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000b', id, 50 from foods where food_code='FD-1'; raise exception 'cross-client accepted'; exception when others then if sqlerrm like '%accepted%' then raise; end if; end; end $$;

-- HISTORICAL INTEGRITY: library changes do not touch existing entries
reset role;
do $$ begin begin update foods set kcal_per_100g = 999 where food_code='FD-1'; raise exception 'accepted'; exception when check_violation then null; end; end $$;
update foods set kcal_per_100g = 180 where food_code='FD-1';
select assert((select nutrition_version from foods where food_code='FD-1') = 2, 'version bumped on nutrient change');
select assert((select count(*) from food_versions where food_id=(select id from foods where food_code='FD-1')) = 2, 'version row appended');
select assert((select kcal from meal_log_entries where id='22222222-2222-2222-2222-222222222222') = 226.55, 'old entry unchanged after library change');
select assert((select kcal_per_100g from meal_log_entries where id='22222222-2222-2222-2222-222222222222') = 165, 'snapshot unchanged');
select assert((select calories from meal_logs where id='11111111-1111-1111-1111-111111111111') = 391.55, 'meal total unchanged after library change');
-- deactivate (as sync would): history intact, FK restrict blocks deletion
update foods set is_active=false, is_published=false where food_code='FD-1';
do $$ begin begin delete from foods where food_code='FD-1'; raise exception 'deleted'; exception when foreign_key_violation then null; end; end $$;
update foods set is_active=true, is_published=true where food_code='FD-1';

set role authenticated; set test.uid = '00000000-0000-0000-0000-00000000000a';
-- edit quantity recomputes from ITS OWN (old) snapshot, not the new 180
update meal_log_entries set quantity_g = 200, kcal_per_100g = 1, food_name='forged' where id='22222222-2222-2222-2222-222222222222';
select assert((select kcal from meal_log_entries where id='22222222-2222-2222-2222-222222222222') = 330.00, 'edit recomputes from old snapshot (165*2)');
select assert((select food_name from meal_log_entries where id='22222222-2222-2222-2222-222222222222') like 'Chicken%', 'snapshot columns immutable');
-- new log uses current library values
insert into meal_log_entries (id, meal_log_id, client_id, food_id, quantity_g)
  select '22222222-2222-2222-2222-222222222223','11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000a', id, 100 from foods where food_code='FD-1';
select assert((select kcal from meal_log_entries where id='22222222-2222-2222-2222-222222222223') = 180.00, 'new log uses new version');
select assert((select food_version_id from meal_log_entries where id='22222222-2222-2222-2222-222222222223') is not null, 'entry links to a version');
-- delete an ingredient
delete from meal_log_entries where id='22222222-2222-2222-2222-222222222223';
select assert((select calories from meal_logs where id='11111111-1111-1111-1111-111111111111') = 495.00, 'total after delete (165+330)');

-- legacy manual row keeps its numbers as a Manual entry when ingredients are added
insert into meal_logs (id, client_id, date, meal, calories, protein_g) values ('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-00000000000a','2026-10-11','Dinner', 500, 40);
select assert((select count(*) from meal_log_entries where meal_log_id='33333333-3333-3333-3333-333333333333') = 0, 'legacy row has no entries yet');
insert into meal_log_entries (meal_log_id, client_id, food_id, quantity_g)
  select '33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-00000000000a', id, 100 from foods where food_code='FD-2';
select assert((select count(*) from meal_log_entries where meal_log_id='33333333-3333-3333-3333-333333333333') = 2, 'legacy numbers preserved as a quick-add entry');
select assert((select calories from meal_logs where id='33333333-3333-3333-3333-333333333333') = 865.00, 'legacy 500 + rice 365');
select assert((select protein_g from meal_logs where id='33333333-3333-3333-3333-333333333333') = 47.10, 'legacy 40 + rice 7.1');
-- carbs: legacy null + rice 80 -> 80 (unknown not coerced into the sum as a number it never had)
select assert((select carbs_g from meal_logs where id='33333333-3333-3333-3333-333333333333') = 80.00, 'carbs = known part only');

-- null handling: an all-unknown quick-add keeps totals NULL (not 0)
insert into meal_logs (id, client_id, date, meal) values ('44444444-4444-4444-4444-444444444444','00000000-0000-0000-0000-00000000000a','2026-10-11','Breakfast');
insert into meal_log_entries (meal_log_id, client_id, food_name) values ('44444444-4444-4444-4444-444444444444','00000000-0000-0000-0000-00000000000a','Mystery shake');
select assert((select calories from meal_logs where id='44444444-4444-4444-4444-444444444444') is null, 'unknown stays NULL');

-- RLS on entries
set test.uid = '00000000-0000-0000-0000-00000000000b';
select assert((select count(*) from meal_log_entries) = 0, 'other client sees no entries');
update meal_log_entries set quantity_g = 1; select assert((select count(*) from meal_log_entries) = 0, 'other client cannot touch entries');
set test.uid = '00000000-0000-0000-0000-0000000000c0';
select assert((select count(*) from meal_log_entries) > 0, 'coach can read entries');
select assert((select count(*) from foods) = 3, 'coach sees unpublished foods');
reset role;
select assert((select quantity_g from meal_log_entries where id='22222222-2222-2222-2222-222222222222') = 200, 'other client edit did not land');
select assert(public.food_version_id_for((select id from foods where food_code='FD-1'), 2) is not null, 'version 2 resolvable');
\echo ALL FOOD LIBRARY DB TESTS PASSED
