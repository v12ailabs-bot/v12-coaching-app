-- Links progress photos to a weekly check-in so they group into weekly sets.
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor BEFORE deploying
-- the week-tabbed photo UI (uploads write checkin_id).
alter table progress_photos add column if not exists checkin_id uuid references weekly_checkins (id) on delete set null;
create index if not exists idx_photos_checkin on progress_photos (checkin_id);
