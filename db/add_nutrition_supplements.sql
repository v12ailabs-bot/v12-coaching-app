-- Generic supplement/vitamin stack attached to each generated nutrition plan.
-- Deliberately NOT personalized (no dosing tailored to meds, conditions, age,
-- etc.) — the AI prompt only ever proposes well-evidenced, general-population
-- staples (protein, creatine, vitamin D3, omega-3, magnesium) with label-
-- standard dosing, so this never crosses into individualized medical/dietetic
-- advice. Nutrition plans auto-publish to the client portal with no coach
-- review step (see generate-program.js), so the disclaimer travels with the
-- data itself rather than living only in a prompt instruction.
--
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.
alter table nutrition_plans
  add column if not exists supplements jsonb not null default '[]'::jsonb,
  add column if not exists supplements_disclaimer text;
