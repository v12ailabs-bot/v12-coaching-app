-- Backs the Postgres-based rate limiter in api/_lib/rateLimit.js. Using a
-- table instead of an in-memory counter so the limit holds across
-- serverless cold starts and multiple regions.
--
-- Idempotent; safe to re-run. Apply via the Supabase SQL Editor.
create table if not exists rate_limits (
  id bigint generated always as identity primary key,
  bucket text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_rate_limits_bucket_created on rate_limits (bucket, created_at);

-- Server only: rateLimit.js always uses the service-role key, which bypasses
-- RLS. No client-facing policy is needed or added.
alter table rate_limits enable row level security;
