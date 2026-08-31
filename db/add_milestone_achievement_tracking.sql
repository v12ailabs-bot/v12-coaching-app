-- Lets a milestone hit surface automatically (coach's Recent Activity feed,
-- a popup when the coach opens that client's page) instead of only showing
-- up once a coach happens to notice the progress bar and clicks "Mark
-- Achieved" manually. achieved_at is set the moment the live-computed
-- current value first clears the target (see recordAchievement in
-- lib/milestones.js) — independent of `status`, which still only flips to
-- 'achieved' when the coach explicitly archives it. coach_acknowledged_at
-- follows the same read-state pattern as client_goal_insights/coach_messages
-- (add_goal_insight_ack.sql) so a hit milestone pops up once, not every time
-- the coach opens the client's page.
alter table client_goals add column if not exists achieved_at timestamptz;
alter table client_goals add column if not exists coach_acknowledged_at timestamptz;
