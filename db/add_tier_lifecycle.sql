-- Tier/account lifecycle data model (spec Section 9). `profiles.client_type`
-- already distinguishes 'coaching' | 'program_only' as a free-text column
-- (no CHECK constraint) -- this migration doesn't change that column, it
-- just documents that 'starter' is now a third valid value once the Starter
-- signup flow exists, and adds the facts needed to derive a client's
-- lifecycle status without storing a redundant status string that could
-- drift from reality (same philosophy as the rest of the app: on-track
-- status, check-in "done today", etc. are all derived from real data, never
-- stored as their own source of truth).
--
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.

-- Starter's 30-day entitlement window + purchase count (drives "New
-- Starter" vs "Returning Starter" -- a customer-history attribute, distinct
-- from lifecycle status, per spec 9I).
alter table profiles
  add column if not exists starter_started_at date,
  add column if not exists starter_expires_at date,
  add column if not exists starter_purchase_count int not null default 0;

-- Program Only's recurring-subscription payment state, system-managed only
-- (never set directly by a coach action) -- separate from client_type
-- itself, since a lapsed/failed payment doesn't change what tier a client
-- was on, just whether that tier is currently entitled.
alter table profiles
  add column if not exists program_payment_status text; -- 'active' | 'past_due' | 'canceled' | null

-- CRM: a Starter/Program/Coaching client's post-signup lifecycle needs to be
-- visible in the pipeline (not just pre-conversion application stages), and
-- "needs a coach to actively follow up" must be a separate flag from just
-- existing as a record -- high Starter volume shouldn't flood the working
-- pipeline (spec Section 10).
alter table leads
  add column if not exists needs_sales_followup boolean not null default false;
create index if not exists idx_leads_needs_followup on leads (needs_sales_followup) where needs_sales_followup;
