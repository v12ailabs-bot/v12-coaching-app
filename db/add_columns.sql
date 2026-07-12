-- Adds the weekly check-in columns the app writes to. Idempotent; safe to
-- re-run. Apply via the Supabase SQL Editor.
alter table weekly_checkins add column if not exists bodyweight numeric;
alter table weekly_checkins add column if not exists week_number int;
alter table weekly_checkins add column if not exists training_days int;
alter table weekly_checkins add column if not exists workout_feel text;
alter table weekly_checkins add column if not exists pump text;
alter table weekly_checkins add column if not exists exercise_feedback text;
alter table weekly_checkins add column if not exists lifts_improved text;
alter table weekly_checkins add column if not exists felt_weaker text;
alter table weekly_checkins add column if not exists cardio_performance text;
alter table weekly_checkins add column if not exists nutrition_compliance int;
alter table weekly_checkins add column if not exists sleep_quality int;
alter table weekly_checkins add column if not exists hydration_quality int;
alter table weekly_checkins add column if not exists discipline_level int;
alter table weekly_checkins add column if not exists confidence_level int;
alter table weekly_checkins add column if not exists mental_blocks text;
alter table weekly_checkins add column if not exists what_went_well text;
alter table weekly_checkins add column if not exists lifestyle_wins text;
alter table weekly_checkins add column if not exists biggest_challenge text;
alter table weekly_checkins add column if not exists holding_back text;
alter table weekly_checkins add column if not exists adjustments text;
alter table weekly_checkins add column if not exists coach_questions text;
