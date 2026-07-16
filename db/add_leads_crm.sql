-- In-app CRM + intake + accept/reject pipeline. One table covers the full
-- lead lifecycle so it doesn't need three overlapping tables:
--   - Notion Lead Pipeline CRM one-time backfill (source='notion_backfill')
--   - in-app intake form submissions (source='intake_form', status='applied')
--   - the coach's accept/reject decision (status -> accepted/closed_lost/
--     follow_up_later/price_objection/not_ready; client_id set on accept)
-- No live sync to Notion; no payment data stored (only that an invoice link
-- was sent and an optional manually-set "paid" flag).
--
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text,
  source text not null default 'manual',      -- 'notion_backfill' | 'intake_form' | 'manual'
  status text not null default 'new',         -- new | applied | accepted | closed_lost | follow_up_later | price_objection | not_ready
  height text,                                -- required on the intake form
  intake_data jsonb,                          -- full intake-form submission (mirrors the Notion Applications DB fields)
  invoice_link text,                          -- manually-created PayPal invoice link the coach pastes in; no payment data stored
  invoice_sent_at timestamptz,
  paid boolean not null default false,        -- coach-set manually; never derived from a payment API
  client_id uuid references profiles (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_leads_email on leads (lower(email));
create index if not exists idx_leads_status on leads (status);

alter table leads enable row level security;

-- Public applicants can submit the intake form (insert-only, no read-back).
drop policy if exists leads_public_insert on leads;
create policy leads_public_insert on leads for insert with check (true);

-- Coach manages everything (CRM view, accept/reject, notes, invoice link).
drop policy if exists leads_coach_all on leads;
create policy leads_coach_all on leads for all using (public.is_coach()) with check (public.is_coach());
