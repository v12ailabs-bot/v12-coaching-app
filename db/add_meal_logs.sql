-- Per-meal nutrition logging (Section 12): a quick "+ Log" per prescribed
-- meal (Breakfast, Lunch, Pre/Post-Workout, Dinner, Evening Snack) on the
-- Nutrition page, alongside the existing daily check-in nutrition fields
-- (see add_daily_nutrition.sql) — not a replacement for them. Both sources
-- feed the same daily total as independent contributions: meal_logs rows sum
-- across meals for the day, daily_checkins.calories/protein_g/carbs_g/fats_g
-- is a separate whole-day number, and the app adds them together rather than
-- letting one overwrite the other.
--
-- One row per (client_id, date, meal) — re-logging the same meal on the same
-- day updates that meal's numbers instead of double-counting a second row.
--
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.
create table if not exists meal_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references profiles (id) on delete cascade,
  date date not null,
  meal text not null,
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fats_g numeric,
  created_at timestamptz default now()
);

create unique index if not exists idx_meal_logs_client_date_meal on meal_logs (client_id, date, meal);
create index if not exists idx_meal_logs_client_date on meal_logs (client_id, date);

alter table meal_logs enable row level security;
drop policy if exists meal_logs_select on meal_logs;
create policy meal_logs_select on meal_logs for select using (client_id = auth.uid() or public.is_coach());
drop policy if exists meal_logs_modify on meal_logs;
create policy meal_logs_modify on meal_logs for all using (client_id = auth.uid()) with check (client_id = auth.uid());
