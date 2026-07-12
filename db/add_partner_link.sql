-- Training-partner linking: lets two (or more) clients SHARE one training
-- program while keeping everything else independent.
--
-- A client whose `shared_program_owner_id` is set reads/writes its TRAINING
-- rows (programs + exercises + program_versions) against the owner's id, so a
-- pair sees the exact same program and an edit to one shows for both. Nutrition
-- plans, workout logs, check-ins, photos, and habits stay keyed to each
-- client's OWN id — they remain fully separate and individually editable.
--
-- Owner rows keep shared_program_owner_id = null (they resolve to themselves).
-- on delete set null: deleting the owner unlinks the partner rather than
-- cascade-wiping them.
--
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.
alter table profiles
  add column if not exists shared_program_owner_id uuid references profiles (id) on delete set null;

create index if not exists idx_profiles_shared_owner on profiles (shared_program_owner_id);
