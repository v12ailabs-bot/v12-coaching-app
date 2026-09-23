-- HC-003 functional verification. Wrapped in begin/rollback so NOTHING
-- persists -- safe to run against the live database. Actually attempts the
-- real exploit (a non-coach self-promoting to 'coach') against a real
-- existing non-coach profile, then undoes everything.
begin;
do $$
declare
  v_client uuid;
  v_failed boolean;
begin
  select id into v_client from profiles where role <> 'coach' limit 1;
  if v_client is null then
    raise notice 'SKIPPED: no non-coach profile found to test against';
    return;
  end if;

  -- Simulate that client's own authenticated session (this is exactly what
  -- auth.uid() reads from on a real request).
  perform set_config('request.jwt.claim.sub', v_client::text, true);

  v_failed := false;
  begin
    update profiles set role = 'coach' where id = v_client;
  exception when others then
    v_failed := true;
    raise notice 'PASS: client self-escalation to role=coach blocked (%)', sqlerrm;
  end;
  if not v_failed then
    raise exception 'FAIL: client self-escalation to role=coach was NOT blocked';
  end if;

  v_failed := false;
  begin
    update profiles set client_type = 'starter' where id = v_client;
  exception when others then
    v_failed := true;
    raise notice 'PASS: client self-edit of client_type blocked (%)', sqlerrm;
  end;
  if not v_failed then
    raise exception 'FAIL: client self-edit of client_type was NOT blocked';
  end if;

  -- Now simulate a service-role call (no user session at all -- exactly
  -- how api/_lib/starterActivation.js and api/sync-client.js write these
  -- same columns today) and confirm it's still allowed.
  perform set_config('request.jwt.claim.sub', '', true);
  update profiles set client_type = 'starter' where id = v_client;
  raise notice 'PASS: service-role-style write to client_type still succeeds (no user session)';

  raise notice 'ALL HC-003 TESTS PASSED';
end $$;
rollback;
