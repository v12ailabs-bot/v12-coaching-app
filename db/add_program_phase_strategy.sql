-- Coaching-strategy fields on top of the existing program_phases roadmap
-- (phase/order_index/week_start/week_end/note) -- extends the roadmap the
-- coach already builds in ProgramRoadmapPlanner into a real phase strategy,
-- without touching the phase-sequence/history mechanics already in place.
-- Client-safe fields (objective/training_focus/movement_focus) can be shown
-- on the client's simplified "why am I here" roadmap; progression_strategy
-- is coach-facing detail the client UI intentionally doesn't render (spec:
-- don't expose "excessive technical progression logic" to the client) --
-- enforced in the component, not RLS, since none of this is truly sensitive
-- the way private notes/AI reasoning are (those stay in coach_notes /
-- client_goal_insights, which already have their own lockdown).
-- exit_criteria: jsonb array of {label, status}, status in
-- complete/incomplete/na -- one row per phase, no separate table needed.
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.
alter table program_phases add column if not exists objective text;
alter table program_phases add column if not exists training_focus text;
alter table program_phases add column if not exists movement_focus text;
alter table program_phases add column if not exists progression_strategy text;
alter table program_phases add column if not exists exit_criteria jsonb not null default '[]';
