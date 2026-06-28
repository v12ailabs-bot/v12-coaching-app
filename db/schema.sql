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
  welcome_seen boolean not null default false,
  -- V12 three-system assessment scores (1-10), set from Notion or by the coach.
  nervous_system_recruitment int,
  muscular_density_to_size int,
  metabolic_work_capacity int,
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

-- Progress photos: metadata rows; the image bytes live in Supabase Storage
-- (bucket 'progress-photos'). `path` is the object path; URLs are signed on read.
create table if not exists progress_photos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles (id) on delete cascade,
  path text not null,
  taken_on date,
  created_at timestamptz not null default now()
);

-- Program templates: reusable training blueprints the coach selects from at
-- generation time. The AI follows the chosen template's structure. Seeded below.
create table if not exists program_templates (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  goal text,
  days_per_week int,
  description text,
  structure text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Reconcile columns on PRE-EXISTING tables
-- ---------------------------------------------------------------------------
-- `create table if not exists` above is skipped for tables that already exist,
-- so older tables may be missing columns this app needs (e.g. the original
-- `programs` table had no client_id). These add-if-missing statements bring any
-- existing table up to date. Columns are added nullable so they don't fail on
-- tables that already contain rows.

-- profiles
alter table profiles add column if not exists name text;
alter table profiles add column if not exists role text default 'client';
alter table profiles add column if not exists goal text;
alter table profiles add column if not exists onboarding_complete boolean default false;
alter table profiles add column if not exists welcome_seen boolean default false;
alter table profiles add column if not exists nervous_system_recruitment int;
alter table profiles add column if not exists muscular_density_to_size int;
alter table profiles add column if not exists metabolic_work_capacity int;
alter table profiles add column if not exists created_at timestamptz default now();

-- programs
alter table programs add column if not exists client_id uuid references profiles (id) on delete cascade;
alter table programs add column if not exists name text;
alter table programs add column if not exists goal text;
alter table programs add column if not exists experience_level text;
alter table programs add column if not exists description text;
alter table programs add column if not exists weeks int default 12;
alter table programs add column if not exists created_at timestamptz default now();

-- exercises
alter table exercises add column if not exists client_id uuid references profiles (id) on delete cascade;
alter table exercises add column if not exists program_id uuid references programs (id) on delete set null;
alter table exercises add column if not exists category text;
alter table exercises add column if not exists day_of_week text;
alter table exercises add column if not exists sets int;
alter table exercises add column if not exists reps text;
alter table exercises add column if not exists is_bodyweight boolean default false;
alter table exercises add column if not exists notes text;
alter table exercises add column if not exists order_index int default 0;
alter table exercises add column if not exists source text default 'coach';
alter table exercises add column if not exists created_at timestamptz default now();

-- nutrition_plans
alter table nutrition_plans add column if not exists client_id uuid references profiles (id) on delete cascade;
alter table nutrition_plans add column if not exists program_id uuid references programs (id) on delete set null;
alter table nutrition_plans add column if not exists name text;
alter table nutrition_plans add column if not exists calories int;
alter table nutrition_plans add column if not exists protein_g int;
alter table nutrition_plans add column if not exists carbs_g int;
alter table nutrition_plans add column if not exists fats_g int;
alter table nutrition_plans add column if not exists hydration text;
alter table nutrition_plans add column if not exists guidelines text;
alter table nutrition_plans add column if not exists meals jsonb default '[]'::jsonb;
alter table nutrition_plans add column if not exists active boolean default true;
alter table nutrition_plans add column if not exists created_at timestamptz default now();

-- daily_checkins
alter table daily_checkins add column if not exists client_id uuid references profiles (id) on delete cascade;
alter table daily_checkins add column if not exists date date;
alter table daily_checkins add column if not exists weight numeric;
alter table daily_checkins add column if not exists sleep int;
alter table daily_checkins add column if not exists energy int;
alter table daily_checkins add column if not exists mood int;
alter table daily_checkins add column if not exists water int;
alter table daily_checkins add column if not exists diet text;
alter table daily_checkins add column if not exists workout text;

-- weekly_checkins
alter table weekly_checkins add column if not exists client_id uuid references profiles (id) on delete cascade;
alter table weekly_checkins add column if not exists date date;
alter table weekly_checkins add column if not exists chest numeric;
alter table weekly_checkins add column if not exists waist numeric;
alter table weekly_checkins add column if not exists hips numeric;
alter table weekly_checkins add column if not exists arms numeric;
alter table weekly_checkins add column if not exists feeling int;
alter table weekly_checkins add column if not exists goal_progress int;
alter table weekly_checkins add column if not exists notes text;

-- workout_logs
alter table workout_logs add column if not exists client_id uuid references profiles (id) on delete cascade;
alter table workout_logs add column if not exists exercise_id uuid references exercises (id) on delete cascade;
alter table workout_logs add column if not exists date date;
alter table workout_logs add column if not exists sets int;
alter table workout_logs add column if not exists reps int;
alter table workout_logs add column if not exists weight numeric;
alter table workout_logs add column if not exists time text;

-- program_templates
alter table program_templates add column if not exists goal text;
alter table program_templates add column if not exists days_per_week int;
alter table program_templates add column if not exists description text;
alter table program_templates add column if not exists structure text;
alter table program_templates add column if not exists created_at timestamptz default now();

-- Seed a few default templates (no-op if a template with the same name exists).
insert into program_templates (name, goal, days_per_week, description, structure) values
  ('V12 Hybrid — Strength / Size / Conditioning', 'Hybrid Performance', 5,
   'The flagship V12 week: all three pillars (powerlifting, bodybuilding, conditioning) every week.',
   'Five days hitting all three V12 pillars weekly. Days 1 & 3 open with a powerlifting main lift (squat/bench/deadlift/press at 1-5 reps, 80-95% 1RM) for nervous-system recruitment and myofibrillar density, then bodybuilding accessories (8-15 reps) for sarcoplasmic fullness. Days 2 & 4 emphasize hypertrophy volume with an explosive-power opener (jumps/throws/Olympic-lift variants). Day 5 is athletic conditioning (intervals/circuits/EMOM) for mitochondrial density and work capacity. Bias volume per the client''s three-system assessment. Deload weeks 6 and 12.'),
  ('Hypertrophy — Upper/Lower', 'Hypertrophy', 4,
   '4-day upper/lower split for muscle growth.',
   'Upper/Lower split run twice over 4 days (Upper, Lower, Upper, Lower). 4-5 exercises per session. Compound lifts first at 3-4 sets x 6-10 reps, accessories at 3 sets x 10-15 reps. Progressive overload weekly; deload weeks 6 and 12.'),
  ('Strength — 5x5 Full Body', 'Strength', 3,
   '3-day full-body strength on a 5x5 scheme.',
   'Full-body 3 days/week (e.g. Mon/Wed/Fri). Built on squat, bench press, deadlift, overhead press, barbell row. Main lifts 5 sets x 5 reps, add load when all reps are met. 1-2 accessories per session at 3 x 8-12.'),
  ('Fat Loss — Full Body Circuit', 'Fat Loss', 4,
   '4-day metabolic circuit training for fat loss.',
   'Full-body circuits 4 days/week. 5-6 exercises performed as supersets/circuits, 3 rounds, 12-15 reps, short rest (30-45s). Include compound movements and a conditioning finisher. Pair with a calorie deficit.'),
  ('Athletic Performance — Push/Pull/Legs', 'Athletic Performance', 5,
   '5-day push/pull/legs for power and conditioning.',
   'Push/Pull/Legs across 5 days plus an upper or conditioning day. Blend strength (3-5 reps), power (explosive 3-5 reps) and hypertrophy (8-12 reps). Add plyometrics and dedicated core work.'),
  ('Beginner Foundations — Full Body', 'General Fitness', 3,
   '3-day beginner full-body program.',
   'Full-body 3 days/week using machine and bodyweight basics. 6-8 exercises at 2-3 sets x 10-12 reps. Emphasize form and consistency; progress load slowly.')
on conflict (name) do nothing;

-- progress_photos
alter table progress_photos add column if not exists path text;
alter table progress_photos add column if not exists taken_on date;
alter table progress_photos add column if not exists created_at timestamptz default now();

create index if not exists idx_exercises_client on exercises (client_id);
create index if not exists idx_nutrition_client_active on nutrition_plans (client_id, active);
create index if not exists idx_daily_client_date on daily_checkins (client_id, date);
create index if not exists idx_weekly_client_date on weekly_checkins (client_id, date);
create index if not exists idx_logs_client_ex on workout_logs (client_id, exercise_id);
create index if not exists idx_photos_client on progress_photos (client_id, created_at);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- The server (generate-program) uses the service-role key and bypasses RLS.
-- These policies govern the browser (anon-key) client used by the portal.
--
-- A coach is whoever has role='coach' in profiles. SECURITY DEFINER lets this
-- function read profiles as the table owner, bypassing RLS so the policies that
-- call it don't recurse. Promote a coach with:  update profiles set role='coach'
-- where email='...';  (the app also sets role='coach' at signup for COACH_EMAIL).
create or replace function public.is_coach()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'coach'
  );
$$;

-- profiles: a user sees/edits their own row; the coach sees/edits all.
alter table profiles enable row level security;
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select using (id = auth.uid() or public.is_coach());
drop policy if exists profiles_insert on profiles;
create policy profiles_insert on profiles for insert with check (id = auth.uid());
drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update using (id = auth.uid() or public.is_coach()) with check (id = auth.uid() or public.is_coach());

-- program_templates: coaches read and manage; clients don't need them.
alter table program_templates enable row level security;
drop policy if exists templates_select on program_templates;
create policy templates_select on program_templates for select using (public.is_coach());
drop policy if exists templates_write on program_templates;
create policy templates_write on program_templates for all using (public.is_coach()) with check (public.is_coach());

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

-- progress_photos: a client manages their own; the coach can read all.
alter table progress_photos enable row level security;
drop policy if exists photos_select on progress_photos;
create policy photos_select on progress_photos for select using (client_id = auth.uid() or public.is_coach());
drop policy if exists photos_modify on progress_photos;
create policy photos_modify on progress_photos for all using (client_id = auth.uid()) with check (client_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Storage: progress photos bucket
-- ---------------------------------------------------------------------------
-- Private bucket; the app serves images via short-lived signed URLs. Files are
-- stored under a per-client folder: '<client_id>/<filename>'.
insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', false)
on conflict (id) do nothing;

-- A client reads/writes/deletes only files in their own folder; the coach reads all.
drop policy if exists progress_photos_read on storage.objects;
create policy progress_photos_read on storage.objects for select using (
  bucket_id = 'progress-photos'
  and (public.is_coach() or (storage.foldername(name))[1] = auth.uid()::text)
);
drop policy if exists progress_photos_insert on storage.objects;
create policy progress_photos_insert on storage.objects for insert with check (
  bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists progress_photos_delete on storage.objects;
create policy progress_photos_delete on storage.objects for delete using (
  bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text
);

-- ===========================================================================
-- V12 expansion: habits, notes, conversations, program phases, resources,
-- client archive, template categories. Appended block — safe to re-run.
-- ===========================================================================

-- profiles: archive flag so the coach can retire clients without deleting data.
alter table profiles add column if not exists archived boolean not null default false;

-- programs: current training phase/block + when it last changed.
alter table programs add column if not exists phase text;
alter table programs add column if not exists phase_note text;
alter table programs add column if not exists phase_updated_at timestamptz;

-- program_templates: a category taxonomy on top of the free-text goal, plus a
-- flag marking the built-in seeds (so duplicates/customs are distinguishable).
alter table program_templates add column if not exists category text;
alter table program_templates add column if not exists is_builtin boolean not null default false;

-- Habits: coach-defined daily habits per client (e.g. "10k steps", "Sleep 8h").
create table if not exists habits (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles (id) on delete cascade,
  name text not null,
  active boolean not null default true,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

-- Habit logs: one row per habit per day the client marks it done.
create table if not exists habit_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles (id) on delete cascade,
  habit_id uuid not null references habits (id) on delete cascade,
  date date not null,
  done boolean not null default true,
  created_at timestamptz not null default now(),
  unique (habit_id, date)
);

-- Coach notes: private coach-only notes attached to a client. Never client-visible.
create table if not exists coach_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles (id) on delete cascade,
  body text not null,
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);

-- Conversations: a log of coach<->client touchpoints (calls, DMs, check-in chats).
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles (id) on delete cascade,
  channel text,                                  -- 'call' | 'text' | 'email' | 'in-person' | 'other'
  summary text not null,
  occurred_on date not null,
  follow_up_on date,                             -- optional next-touch reminder
  created_at timestamptz not null default now()
);

-- Resources: a shared recipe / article / video library clients can browse.
create table if not exists resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text,                                 -- 'Recipe' | 'Article' | 'Video' | 'Guide' | ...
  kind text not null default 'article',          -- 'recipe' | 'article' | 'video' | 'pdf'
  url text,
  body text,                                     -- recipe steps / notes / description
  calories int,                                  -- recipe macros (optional)
  protein_g int,
  carbs_g int,
  fats_g int,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_habits_client on habits (client_id, active);
create index if not exists idx_habit_logs_client_date on habit_logs (client_id, date);
create index if not exists idx_notes_client on coach_notes (client_id, created_at);
create index if not exists idx_convos_client on conversations (client_id, occurred_on);
create index if not exists idx_resources_kind on resources (kind, created_at);

-- Mark the seeded templates as built-ins (so the UI can label/duplicate them).
update program_templates set is_builtin = true
  where name in (
    'V12 Hybrid — Strength / Size / Conditioning',
    'Hypertrophy — Upper/Lower',
    'Strength — 5x5 Full Body',
    'Fat Loss — Full Body Circuit',
    'Athletic Performance — Push/Pull/Legs',
    'Beginner Foundations — Full Body'
  ) and is_builtin = false;

-- Backfill template categories from their goal where unset.
update program_templates set category = case
    when category is not null then category
    when goal ilike '%fat%'        then 'Fat Loss'
    when goal ilike '%hypertrophy%' or goal ilike '%muscle%' then 'Muscle'
    when goal ilike '%strength%'   then 'Strength'
    when goal ilike '%athletic%' or goal ilike '%performance%' then 'Athletic'
    when goal ilike '%hybrid%'     then 'Hybrid'
    when goal ilike '%general%' or goal ilike '%beginner%' then 'Beginner'
    else 'General'
  end
  where category is null;

-- Seed a few starter library resources (no-op if titles already present).
insert into resources (title, category, kind, url, body, calories, protein_g, carbs_g, fats_g)
select * from (values
  ('High-Protein Overnight Oats', 'Recipe', 'recipe', null,
   E'Combine 1/2 cup rolled oats, 1 scoop whey, 1 cup almond milk, 1 tbsp chia. Refrigerate overnight. Top with berries.',
   420, 38, 48, 9),
  ('Lean Beef & Rice Bowl', 'Recipe', 'recipe', null,
   E'6oz 90/10 ground beef, 1 cup jasmine rice, mixed peppers, low-sodium soy. Cook beef, combine, season.',
   560, 42, 62, 14),
  ('How to Progress Your Lifts', 'Guide', 'article', null,
   E'Add load when you hit the top of the prescribed rep range on all sets with clean form. Otherwise repeat the weight and add reps. Deload every 6 weeks.',
   null, null, null, null),
  ('Dialing In Sleep for Recovery', 'Article', 'article', null,
   E'Consistent sleep/wake times, dark cool room, no screens 30 min before bed, and caffeine cutoff 8 hours pre-sleep drive better recovery and adherence.',
   null, null, null, null)
) as v(title, category, kind, url, body, calories, protein_g, carbs_g, fats_g)
where not exists (select 1 from resources r where r.title = v.title);

-- RLS for the new tables.
-- habits: coach defines; client reads their own.
alter table habits enable row level security;
drop policy if exists habits_select on habits;
create policy habits_select on habits for select using (client_id = auth.uid() or public.is_coach());
drop policy if exists habits_write on habits;
create policy habits_write on habits for all using (public.is_coach()) with check (public.is_coach());

-- habit_logs: a client toggles their own; the coach reads all.
alter table habit_logs enable row level security;
drop policy if exists habit_logs_select on habit_logs;
create policy habit_logs_select on habit_logs for select using (client_id = auth.uid() or public.is_coach());
drop policy if exists habit_logs_modify on habit_logs;
create policy habit_logs_modify on habit_logs for all using (client_id = auth.uid()) with check (client_id = auth.uid());

-- coach_notes: coach-only, never visible to clients.
alter table coach_notes enable row level security;
drop policy if exists notes_all on coach_notes;
create policy notes_all on coach_notes for all using (public.is_coach()) with check (public.is_coach());

-- conversations: coach-only.
alter table conversations enable row level security;
drop policy if exists convos_all on conversations;
create policy convos_all on conversations for all using (public.is_coach()) with check (public.is_coach());

-- resources: any authenticated user reads published ones; coach manages.
alter table resources enable row level security;
drop policy if exists resources_select on resources;
create policy resources_select on resources for select using (published or public.is_coach());
drop policy if exists resources_write on resources;
create policy resources_write on resources for all using (public.is_coach()) with check (public.is_coach());

-- Program version history: immutable snapshots of a client's training plan
-- (program metadata + the full exercise list) captured on generate / snapshot /
-- restore, so the coach can review and roll back. `version` increments per client.
create table if not exists program_versions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles (id) on delete cascade,
  program_id uuid references programs (id) on delete set null,
  version int not null,
  label text,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_versions_client on program_versions (client_id, version);

alter table program_versions enable row level security;
drop policy if exists versions_select on program_versions;
create policy versions_select on program_versions for select using (client_id = auth.uid() or public.is_coach());
drop policy if exists versions_write on program_versions;
create policy versions_write on program_versions for all using (public.is_coach()) with check (public.is_coach());

-- ===========================================================================
-- Notion migration staging + claim-on-signup
-- ===========================================================================
-- Existing clients have no profile row until they sign up (profiles.id -> auth
-- .users). The migration script (scripts/migrate-notion.js) pulls their Notion
-- data and parks it in these `staged_*` tables keyed by a normalized name. When
-- the client signs up, the app calls claim_staged_data(), which matches by name
-- and copies everything into their real tables, then flags the profile claimed.

alter table profiles add column if not exists staged_claimed boolean not null default false;

-- Normalized match key from a name: first token, lowercased, alphanumerics only.
-- "Samer Haddad" -> "samer". The script computes the identical key in JS.
create or replace function public.staged_name_key(p text)
returns text language sql immutable as $$
  select lower(regexp_replace(split_part(coalesce(trim(p), ''), ' ', 1), '[^A-Za-z0-9]', '', 'g'));
$$;

-- One row per staged client (intake + assessment + raw Notion capture).
create table if not exists staged_clients (
  client_key text primary key,
  name text,
  email text,
  goal text,
  experience_level text,
  days_available text,
  injuries text,
  equipment text,
  session_length text,
  dietary_preference text,
  allergies text,
  calorie_target text,
  program_template text,
  nervous_system_recruitment int,
  muscular_density_to_size int,
  metabolic_work_capacity int,
  notes text,                                    -- free-text page content
  raw jsonb not null default '{}'::jsonb,        -- every Notion property, untouched
  created_at timestamptz not null default now()
);

create table if not exists staged_daily_checkins (
  id uuid primary key default gen_random_uuid(),
  client_key text not null,
  date date not null,
  weight numeric, sleep int, energy int, mood int, water int, diet text, workout text
);
create table if not exists staged_weekly_checkins (
  id uuid primary key default gen_random_uuid(),
  client_key text not null,
  date date not null,
  chest numeric, waist numeric, hips numeric, arms numeric, feeling int, goal_progress int, notes text
);
create table if not exists staged_exercises (
  id uuid primary key default gen_random_uuid(),
  client_key text not null,
  name text not null, category text, day_of_week text, sets int, reps text,
  is_bodyweight boolean default false, notes text, order_index int default 0, source text default 'coach'
);
create table if not exists staged_workout_logs (
  id uuid primary key default gen_random_uuid(),
  client_key text not null,
  exercise_name text not null, date date not null, sets int, reps int, weight numeric, time text
);
create table if not exists staged_nutrition_plans (
  id uuid primary key default gen_random_uuid(),
  client_key text not null,
  name text, calories int, protein_g int, carbs_g int, fats_g int,
  hydration text, guidelines text, meals jsonb not null default '[]'::jsonb
);

create index if not exists idx_staged_daily_key on staged_daily_checkins (client_key);
create index if not exists idx_staged_weekly_key on staged_weekly_checkins (client_key);
create index if not exists idx_staged_exercises_key on staged_exercises (client_key);
create index if not exists idx_staged_logs_key on staged_workout_logs (client_key);
create index if not exists idx_staged_nutrition_key on staged_nutrition_plans (client_key);

-- Staging is coach/service-only. The migration script uses the service-role key
-- (bypasses RLS); claim_staged_data() is SECURITY DEFINER (also bypasses).
do $$ declare t text; begin
  foreach t in array array['staged_clients','staged_daily_checkins','staged_weekly_checkins','staged_exercises','staged_workout_logs','staged_nutrition_plans']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t||'_coach', t);
    execute format('create policy %I on %I for all using (public.is_coach()) with check (public.is_coach())', t||'_coach', t);
  end loop;
end $$;

-- Called by the client right after signup. Matches staged data by name and
-- copies it into their real tables. Idempotent: sets profiles.staged_claimed so
-- it only runs once, and never clobbers values the client/coach already has.
create or replace function public.claim_staged_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text; v_claimed boolean; v_key text;
  v_sc staged_clients%rowtype;
  v_program_id uuid;
  v_daily int := 0; v_weekly int := 0; v_ex int := 0; v_logs int := 0; v_nut int := 0;
begin
  if v_uid is null then return jsonb_build_object('claimed', false, 'reason', 'not authenticated'); end if;

  select name, staged_claimed into v_name, v_claimed from profiles where id = v_uid;
  if coalesce(v_claimed, false) then return jsonb_build_object('claimed', false, 'reason', 'already claimed'); end if;

  v_key := staged_name_key(v_name);
  if v_key is null or v_key = '' then return jsonb_build_object('claimed', false, 'reason', 'no name on profile'); end if;

  select * into v_sc from staged_clients where client_key = v_key;
  if not found then
    -- Nothing staged for this name: flag so we don't re-check on every login.
    update profiles set staged_claimed = true where id = v_uid;
    return jsonb_build_object('claimed', false, 'reason', 'no staged data for ' || v_key);
  end if;

  -- 1. Profile intake/assessment — fill only where currently empty.
  update profiles p set
    goal = coalesce(p.goal, v_sc.goal),
    nervous_system_recruitment = coalesce(p.nervous_system_recruitment, v_sc.nervous_system_recruitment),
    muscular_density_to_size   = coalesce(p.muscular_density_to_size,   v_sc.muscular_density_to_size),
    metabolic_work_capacity    = coalesce(p.metabolic_work_capacity,    v_sc.metabolic_work_capacity)
  where p.id = v_uid;

  -- 2. Daily check-ins
  insert into daily_checkins (client_id, date, weight, sleep, energy, mood, water, diet, workout)
  select v_uid, s.date, s.weight, s.sleep, s.energy, s.mood, s.water, s.diet, s.workout
  from staged_daily_checkins s where s.client_key = v_key
  on conflict (client_id, date) do nothing;
  get diagnostics v_daily = row_count;

  -- 3. Weekly check-ins
  insert into weekly_checkins (client_id, date, chest, waist, hips, arms, feeling, goal_progress, notes)
  select v_uid, s.date, s.chest, s.waist, s.hips, s.arms, s.feeling, s.goal_progress, s.notes
  from staged_weekly_checkins s where s.client_key = v_key
  on conflict (client_id, date) do nothing;
  get diagnostics v_weekly = row_count;

  -- 4. Program + exercises (only if staged and none assigned yet)
  if exists (select 1 from staged_exercises where client_key = v_key)
     and not exists (select 1 from exercises where client_id = v_uid) then
    insert into programs (client_id, name, goal, description)
    values (v_uid, coalesce(v_sc.program_template, 'Imported Program'), v_sc.goal, 'Imported from Notion')
    returning id into v_program_id;

    insert into exercises (client_id, program_id, name, category, day_of_week, sets, reps, is_bodyweight, notes, order_index, source)
    select v_uid, v_program_id, s.name, s.category, s.day_of_week, s.sets, s.reps,
           coalesce(s.is_bodyweight, false), s.notes, coalesce(s.order_index, 0), coalesce(s.source, 'coach')
    from staged_exercises s where s.client_key = v_key;
    get diagnostics v_ex = row_count;

    -- 5. Workout logs — resolve exercise_id by name within the imported program.
    insert into workout_logs (client_id, exercise_id, date, sets, reps, weight, time)
    select v_uid, e.id, s.date, s.sets, s.reps, s.weight, s.time
    from staged_workout_logs s
    join exercises e on e.client_id = v_uid and lower(e.name) = lower(s.exercise_name)
    where s.client_key = v_key;
    get diagnostics v_logs = row_count;
  end if;

  -- 6. Nutrition plan (only if none active yet)
  if exists (select 1 from staged_nutrition_plans where client_key = v_key)
     and not exists (select 1 from nutrition_plans where client_id = v_uid and active) then
    insert into nutrition_plans (client_id, program_id, name, calories, protein_g, carbs_g, fats_g, hydration, guidelines, meals, active)
    select v_uid, v_program_id, coalesce(s.name, 'Imported Nutrition Plan'), s.calories, s.protein_g, s.carbs_g, s.fats_g,
           s.hydration, s.guidelines, coalesce(s.meals, '[]'::jsonb), true
    from staged_nutrition_plans s where s.client_key = v_key
    limit 1;
    get diagnostics v_nut = row_count;
  end if;

  update profiles set staged_claimed = true where id = v_uid;

  return jsonb_build_object('claimed', true, 'key', v_key,
    'daily', v_daily, 'weekly', v_weekly, 'exercises', v_ex, 'logs', v_logs, 'nutrition', v_nut);
end;
$$;

grant execute on function public.claim_staged_data() to authenticated;
