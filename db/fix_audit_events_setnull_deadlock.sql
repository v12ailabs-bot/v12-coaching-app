-- Fix: head_coach_audit_events.task_id/recommendation_id use ON DELETE SET
-- NULL, but Postgres implements SET NULL as an internal UPDATE on the child
-- row -- the same mechanism CASCADE uses for DELETE (already flagged once in
-- the HC-003 review, for a different pair of columns). That UPDATE fired
-- head_coach_forbid_write(), which blocked ALL updates unconditionally, so
-- the SET NULL could never actually succeed: deleting a task or
-- recommendation that has any audit event referencing it always failed with
-- "head_coach_audit_events is append-only: UPDATE is not permitted" instead
-- of cleanly detaching the reference.
--
-- Found live during HC-005 (the first code to actually write an audit event
-- with a real task_id) -- HC-002's own verification never exercised this
-- path, since nothing populated audit_events with a task_id at that time.
--
-- Considered and rejected: switching these two FKs to RESTRICT (like the
-- HC-003 fix did for task_id/recommendation_id/context_snapshot_id
-- elsewhere) would "fix" this cleanly but has a real cost here specifically:
-- every task now gets an audit event immediately on creation (HC-005's
-- design), so RESTRICT would make EVERY task/recommendation permanently
-- undeletable forever, including test/debug ones -- a real problem given
-- this repo has no staging environment, so all HC-006 onward development
-- will keep live-testing directly against prod.

-- Fix instead: keep ON DELETE SET NULL, but make the trigger smart enough to
-- allow exactly that pattern (task_id/recommendation_id transitioning to
-- NULL, nothing else about the row changing) while still blocking any
-- actual content tampering. DELETE on audit_events remains fully forbidden
-- either way -- there's no legitimate reason to ever delete an audit row
-- directly.
--
-- Idempotent; safe to re-run.

create or replace function public.head_coach_audit_events_guard_update()
returns trigger
language plpgsql
as $$
begin
  if NEW.event_type is distinct from OLD.event_type
    or NEW.client_id is distinct from OLD.client_id
    or NEW.actor is distinct from OLD.actor
    or NEW.actor_id is distinct from OLD.actor_id
    or NEW.actor_label is distinct from OLD.actor_label
    or NEW.payload is distinct from OLD.payload
    or NEW.methodology_version is distinct from OLD.methodology_version
    or NEW.created_at is distinct from OLD.created_at
  then
    raise exception 'head_coach_audit_events is append-only: only task_id/recommendation_id may ever be cleared to null (by a parent delete) -- nothing else may change';
  end if;
  if OLD.task_id is not null and NEW.task_id is distinct from OLD.task_id and NEW.task_id is not null then
    raise exception 'head_coach_audit_events: task_id can only be cleared to null, never reassigned to a different value';
  end if;
  if OLD.recommendation_id is not null and NEW.recommendation_id is distinct from OLD.recommendation_id and NEW.recommendation_id is not null then
    raise exception 'head_coach_audit_events: recommendation_id can only be cleared to null, never reassigned to a different value';
  end if;
  return NEW;
end;
$$;

drop trigger if exists head_coach_audit_immutable on head_coach_audit_events;
drop trigger if exists head_coach_audit_no_update_tamper on head_coach_audit_events;
create trigger head_coach_audit_no_update_tamper
  before update on head_coach_audit_events
  for each row execute function public.head_coach_audit_events_guard_update();

drop trigger if exists head_coach_audit_no_delete on head_coach_audit_events;
create trigger head_coach_audit_no_delete
  before delete on head_coach_audit_events
  for each row execute function public.head_coach_forbid_write();
