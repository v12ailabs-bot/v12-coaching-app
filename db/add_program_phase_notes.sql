-- Per-planned-phase notes on the roadmap itself (program_phases), distinct
-- from programs.phase_note (which is the single "current phase announcement"
-- and unchanged by this migration). Lets a coach write a note for ANY phase
-- in the roadmap -- past, current, or future -- so clicking a phase circle
-- can show something real instead of only ever having a note for whichever
-- phase happens to be current right now.
--
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.
alter table program_phases add column if not exists note text;
