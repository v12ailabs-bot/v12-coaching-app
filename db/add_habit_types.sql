-- Habit type system. `type` defaults to 'completion_button' (today's only
-- behavior, a plain checkbox) so every existing habit row keeps its exact
-- current behavior -- no backfill script needed.
--
-- 'manual_value': coach sets target_value/unit/target_direction; used for
-- metrics with no existing target source elsewhere (Steps, Water). Client
-- enters a number each day.
--
-- 'linked_check_in_value': NOT a separate input -- tied to a daily_checkins
-- numeric field the client is already entering (`linked_field`). For macro
-- fields (calories/protein_g/carbs_g/fats_g) the target is read live from
-- the client's active nutrition_plans row at render time, never from
-- target_value on this table, so there is exactly one place a coach sets a
-- macro target. target_value/unit/target_direction on this row only apply
-- to manual_value habits, or to a linked field with no other target source
-- (e.g. water).
--
-- `metric_key` is an optional, coach-set well-known key (e.g. 'steps') that
-- lets the client Today screen recognize "this habit IS steps" without
-- fragile free-text name matching, so it can skip showing a duplicate
-- manual Steps field on the Daily Check-In.
--
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.
alter table habits add column if not exists type text not null default 'completion_button';
alter table habits add column if not exists target_value numeric;
alter table habits add column if not exists unit text;
alter table habits add column if not exists target_direction text not null default 'at_least';
alter table habits add column if not exists linked_field text;
alter table habits add column if not exists metric_key text;

-- Client's entered number for manual_value habits (null for completion_button,
-- which keeps using the existing `done` column).
alter table habit_logs add column if not exists value numeric;
