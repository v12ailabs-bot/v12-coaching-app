-- Starter self-serve checkout sessions (spec Section 9A). Tracks a Starter
-- signup attempt from "email entered" through "payment confirmed" so the
-- webhook/manual-confirm path is idempotent (confirming an already-confirmed
-- session is a no-op, not a duplicate account/charge) and so nothing about
-- an account or entitlement exists until status flips to 'confirmed' --
-- checkout-started/clicked never creates a real account.
--
-- Server-only (API routes using the service-role key); no public RLS
-- policies, so this table is invisible to both anon and authenticated
-- clients by default.
--
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.
create table if not exists starter_checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  status text not null default 'pending', -- pending | confirmed | expired
  provider_ref text,                       -- Payoneer's session/order id, once wired
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create index if not exists idx_starter_checkout_email on starter_checkout_sessions (lower(email));
create index if not exists idx_starter_checkout_status on starter_checkout_sessions (status);

alter table starter_checkout_sessions enable row level security;
