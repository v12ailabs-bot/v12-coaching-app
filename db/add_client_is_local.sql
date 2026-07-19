-- Flags a client as training at the coach's own (local/commercial) gym, so
-- program generation can enforce that gym's actual equipment inventory
-- instead of relying only on the client's free-text intake equipment answer.
--
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.
alter table profiles
  add column if not exists is_local boolean not null default false;
