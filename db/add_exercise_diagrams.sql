-- Muscle-group diagrams, synced from Notion's "Muscle Group Diagrams"
-- database (data source id 237a8e98-9c5e-4bde-a9c6-b110084b184e) by
-- scripts/sync-exercise-diagrams.mjs. Notion's own file URLs (whether on a
-- page's file property or pasted into the body) are temporary S3 links that
-- expire in about an hour, so images are downloaded once and re-hosted here
-- rather than linked live -- the app never calls Notion at runtime for this.
-- Public bucket: these are generic illustrations, not client data, so a
-- permanent public URL is simpler than progress-photos' signed-URL pattern.
insert into storage.buckets (id, name, public)
values ('exercise-diagrams', 'exercise-diagrams', true)
on conflict (id) do nothing;

drop policy if exists exercise_diagrams_read on storage.objects;
create policy exercise_diagrams_read on storage.objects for select using (bucket_id = 'exercise-diagrams');
drop policy if exists exercise_diagrams_write on storage.objects;
create policy exercise_diagrams_write on storage.objects for all
  using (bucket_id = 'exercise-diagrams' and public.is_coach())
  with check (bucket_id = 'exercise-diagrams' and public.is_coach());

-- One row per muscle group (matches the 11 titles in the Notion source:
-- Full Body, Chest, Back, Shoulders, Biceps, Triceps, Quads, Hamstrings,
-- Glutes, Calves, Core / Abs). focus_tags mirrors Notion's multi-select
-- (Push/Pull/Upper Body/Lower Body/Core/Full Body) for reference; the app's
-- own classifier (muscleGroupForExercise) maps exercise names directly to
-- muscle_group, not through these tags.
create table if not exists exercise_diagrams (
  muscle_group text primary key,
  image_url text not null,
  focus_tags text[] not null default '{}',
  synced_at timestamptz not null default now()
);

alter table exercise_diagrams enable row level security;
drop policy if exists exercise_diagrams_select on exercise_diagrams;
create policy exercise_diagrams_select on exercise_diagrams for select using (true);
drop policy if exists exercise_diagrams_all on exercise_diagrams;
create policy exercise_diagrams_all on exercise_diagrams for all using (public.is_coach()) with check (public.is_coach());
