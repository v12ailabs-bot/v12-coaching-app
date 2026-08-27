-- AI progression recommendations: advisory only, per Part 25/26 of the
-- roadmap spec -- the AI never writes to programs/exercises directly, it
-- only proposes a recommendation the coach explicitly approves, modifies,
-- holds, or rejects. Coach-only end to end (mirrors client_assessments'
-- all-is_coach() policy) -- this is internal coaching reasoning, not
-- something to expose to the client per spec.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'phase_recommendation_status') then
    create type phase_recommendation_status as enum ('pending', 'approved', 'modified', 'held', 'rejected');
  end if;
end $$;

create table if not exists program_phase_recommendations (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs (id) on delete cascade,
  client_id uuid not null references profiles (id) on delete cascade,
  phase text not null,
  recommendation_text text not null,
  reasoning_text text,
  suggested_action text,
  status phase_recommendation_status not null default 'pending',
  coach_decision_note text,
  decided_by uuid references profiles (id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_phase_recs_client on program_phase_recommendations (client_id, created_at desc);

alter table program_phase_recommendations enable row level security;
drop policy if exists phase_recs_all on program_phase_recommendations;
create policy phase_recs_all on program_phase_recommendations for all using (public.is_coach()) with check (public.is_coach());
