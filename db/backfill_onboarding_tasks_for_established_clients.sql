-- One-time cleanup: client_onboarding_tasks rows seeded before the
-- "already established" check existed (add_onboarding_tasks.sql originally
-- always inserted as not_started) wrongly show months/years-in clients as
-- having incomplete onboarding. Same "already established" signal the app
-- now checks at seed time: profiles.onboarding_complete, or any real
-- logged exercises/workouts. Safe to re-run; only ever marks rows complete,
-- never uncompletes anything. Run once via the Supabase SQL Editor.
update client_onboarding_tasks t
set status = 'completed', completed_at = now(), updated_at = now()
where t.status <> 'completed'
  and (
    exists (select 1 from profiles p where p.id = t.client_id and p.onboarding_complete = true)
    or exists (select 1 from exercises e where e.client_id = t.client_id)
    or exists (select 1 from workout_logs w where w.client_id = t.client_id)
  );
