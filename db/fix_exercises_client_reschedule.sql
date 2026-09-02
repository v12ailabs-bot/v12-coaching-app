
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.
drop policy if exists exercises_write on exercises;
drop policy if exists exercises_insert on exercises;
drop policy if exists exercises_delete on exercises;
drop policy if exists exercises_update on exercises;

create policy exercises_insert on exercises for insert with check (public.is_coach());
create policy exercises_delete on exercises for delete using (public.is_coach());
create policy exercises_update on exercises for update
  using (client_id = auth.uid() or public.is_coach())
  with check (client_id = auth.uid() or public.is_coach());
