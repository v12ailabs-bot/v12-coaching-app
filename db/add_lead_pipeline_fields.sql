-- Field parity with the Notion "V12 Lead Pipeline — CRM" database, so leads
-- met via cold outreach (DM/social, never touching the in-app intake form)
-- can be logged directly in the app with the same fields the coach already
-- tracks in Notion. Confirmed against the live Notion schema (data source
-- 22241e03-5f95-48c4-8f97-856abb1faf7b) via the API on 2026-07-17:
--   Lead Name, Email, Goal, Stage, Source, Response Rate, Deal Value,
--   Follow Up Date, Last Contact Date, Notes, DM Opener Sent,
--   Application Submitted, Call Booked, Moved to WhatsApp, Lead ID (auto).
--
-- Lead Name/Email/Goal/Notes/Follow Up Date already exist on `leads`
-- (name/email/goal/notes/follow_up_date). `channel` is deliberately its own
-- column, NOT reusing the existing `source` column — `source` already means
-- something else here (how the row entered THIS app's database: manual |
-- intake_form | notion_backfill), while Notion's "Source" means which
-- marketing channel the lead came from (TikTok, Instagram, etc.) — conflating
-- the two would silently corrupt the existing meaning of `source`.
--
-- `stage` is intentionally separate from the existing `status` column too:
-- `status` drives the app's own accept/reject/signup-gating workflow (its
-- values are hardcoded into CRMPanel's filter tabs and Accept/Reject
-- buttons); `stage` is supplementary cold-outreach context that doesn't
-- drive any app logic, so adding Notion's stage vocabulary here can't break
-- the existing pipeline UI.
--
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.
alter table leads
  add column if not exists channel text,              -- Notion "Source": TikTok | Instagram | Facebook | Referral | WhatsApp Cold | Other
  add column if not exists stage text,                 -- Notion "Stage": New DM | Qualifying | Application Sent | WhatsApp Moved | Call Booked | Call Done | Closed Won | Closed Lost | Ghost
  add column if not exists response_rate text,         -- Notion "Response Rate": Replied | No Response | Ghosted After Interest
  add column if not exists deal_value numeric,          -- Notion "Deal Value" ($)
  add column if not exists last_contact_date date,
  add column if not exists dm_opener_sent boolean not null default false,
  add column if not exists application_submitted boolean not null default false,
  add column if not exists call_booked boolean not null default false,
  add column if not exists moved_to_whatsapp boolean not null default false;
