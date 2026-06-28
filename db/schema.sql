-- V12 Coaching App — Supabase schema
-- Apply in the Supabase SQL editor. Safe to re-run (idempotent where possible).

-- Profiles: one row per authenticated user (coach or client).
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text unique not null,
  name text,
  role text not null default 'client',          -- 'coach' | 'client'
  goal text,
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now()
);

-- Programs: metadata for a generated/assigned training program.
create table if not exists programs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles (id) on delete cascade,
  name text,
  goal text,
  experience_level text,
  description text,
  weeks int default 12,
  created_at timestamptz not null default now()
);

-- Exercises: the flat, per-client exercise list the portal reads and logs against.
-- AI-generated rows use source='ai'; coach-added rows use source='coach'.
create table if not exists exercises (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles (id) on delete cascade,
  program_id uuid references programs (id) on delete set null,
  name text not null,
  category text,
  day_of_week text,
  sets int,
  reps text,
  is_bodyweight boolean not null default false,
  notes text,
  order_index int not null default 0,
  source text not null default 'coach',          -- 'ai' | 'coach'
  created_at timestamptz not null default now()
);

-- Backfill columns if the table predates this schema.
alter table exercises add column if not exists program_id uuid references programs (id) on delete set null;
alter table exercises add column if not exists day_of_week text;
alter table exercises add column if not exists sets int;
alter table exercises add column if not exists reps text;
alter table exercises add column if not exists notes text;
alter table exercises add column if not exists order_index int not null default 0;
alter table exercises add column if not exists source text not null default 'coach';

-- Nutrition plans: one active plan per client, with macro targets and meals (JSON).
create table if not exists nutrition_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles (id) on delete cascade,
  program_id uuid references programs (id) on delete set null,
  name text,
  calories int,
  protein_g int,
  carbs_g int,
  fats_g int,
  hydration text,
  guidelines text,
  meals jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Daily check-ins (client self-reported wellness).
create table if not exists daily_checkins (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles (id) on delete cascade,
  date date not null,
  weight numeric,
  sleep int,
  energy int,
  mood int,
  water int,
  diet text,
  workout text,
  created_at timestamptz not null default now(),
  unique (client_id, date)
);

-- Weekly check-ins (measurements + progress).
create table if not exists weekly_checkins (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles (id) on delete cascade,
  date date not null,
  chest numeric,
  waist numeric,
  hips numeric,
  arms numeric,
  feeling int,
  goal_progress int,
  notes text,
  created_at timestamptz not null default now(),
  unique (client_id, date)
);

-- Workout logs (per-set training records).
create table if not exists workout_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles (id) on delete cascade,
  exercise_id uuid not null references exercises (id) on delete cascade,
  date date not null,
  sets int,
  reps int,
  weight numeric,
  time text,
  created_at timestamptz not null default now()
);

create index if not exists idx_exercises_client on exercises (client_id);
create index if not exists idx_nutrition_client_active on nutrition_plans (client_id, active);
create index if not exists idx_daily_client_date on daily_checkins (client_id, date);
create index if not exists idx_weekly_client_date on weekly_checkins (client_id, date);
create index if not exists idx_logs_client_ex on workout_logs (client_id, exercise_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- The server (generate-program) uses the service-role key and bypasses RLS.
-- These policies govern the browser (anon-key) client used by the portal.
--
-- A coach is identified by JWT email (matches COACH_EMAIL in src/App.jsx).
-- Checking the JWT instead of the profiles table avoids recursive policies.
-- Update the email here if you change COACH_EMAIL.
create or replace function public.is_coach()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'coach@v12system.com';
$$;

-- profiles: a user sees/edits their own row; the coach sees/edits all.
alter table profiles enable row level security;
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select using (id = auth.uid() or public.is_coach());
drop policy if exists profiles_insert on profiles;
create policy profiles_insert on profiles for insert with check (id = auth.uid());
drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update using (id = auth.uid() or public.is_coach()) with check (id = auth.uid() or public.is_coach());

-- programs: clients read their own; only the coach writes.
alter table programs enable row level security;
drop policy if exists programs_select on programs;
create policy programs_select on programs for select using (client_id = auth.uid() or public.is_coach());
drop policy if exists programs_write on programs;
create policy programs_write on programs for all using (public.is_coach()) with check (public.is_coach());

-- exercises: clients read their own; only the coach adds/edits/removes.
alter table exercises enable row level security;
drop policy if exists exercises_select on exercises;
create policy exercises_select on exercises for select using (client_id = auth.uid() or public.is_coach());
drop policy if exists exercises_write on exercises;
create policy exercises_write on exercises for all using (public.is_coach()) with check (public.is_coach());

-- nutrition_plans: clients read their own; only the coach writes.
alter table nutrition_plans enable row level security;
drop policy if exists nutrition_select on nutrition_plans;
create policy nutrition_select on nutrition_plans for select using (client_id = auth.uid() or public.is_coach());
drop policy if exists nutrition_write on nutrition_plans;
create policy nutrition_write on nutrition_plans for all using (public.is_coach()) with check (public.is_coach());

-- daily_checkins: a client manages their own; the coach can read all.
alter table daily_checkins enable row level security;
drop policy if exists daily_select on daily_checkins;
create policy daily_select on daily_checkins for select using (client_id = auth.uid() or public.is_coach());
drop policy if exists daily_modify on daily_checkins;
create policy daily_modify on daily_checkins for all using (client_id = auth.uid()) with check (client_id = auth.uid());

-- weekly_checkins: a client manages their own; the coach can read all.
alter table weekly_checkins enable row level security;
drop policy if exists weekly_select on weekly_checkins;
create policy weekly_select on weekly_checkins for select using (client_id = auth.uid() or public.is_coach());
drop policy if exists weekly_modify on weekly_checkins;
create policy weekly_modify on weekly_checkins for all using (client_id = auth.uid()) with check (client_id = auth.uid());

-- workout_logs: a client manages their own; the coach can read all.
alter table workout_logs enable row level security;
drop policy if exists logs_select on workout_logs;
create policy logs_select on workout_logs for select using (client_id = auth.uid() or public.is_coach());
drop policy if exists logs_modify on workout_logs;
create policy logs_modify on workout_logs for all using (client_id = auth.uid()) with check (client_id = auth.uid());
