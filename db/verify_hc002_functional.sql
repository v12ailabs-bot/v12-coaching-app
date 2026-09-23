-- HC-002 functional verification. Wrapped in begin/rollback so NOTHING
-- persists -- safe to run against the live database. Uses one arbitrary
-- existing profile row as a throwaway parent, then undoes everything.
begin;
do $$
declare
  v_client uuid;
  v_task uuid;
  v_snapshot uuid;
  v_rec uuid;
  v_failed boolean;
begin
  select id into v_client from profiles limit 1;

  insert into head_coach_tasks (task_type, client_id, source_table, source_id)
  values ('REVIEW_CHECK_IN', v_client, 'daily_checkins', gen_random_uuid())
  returning id into v_task;

  insert into head_coach_context_snapshots (task_id, snapshot)
  values (v_task, '{"test": true}'::jsonb)
  returning id into v_snapshot;

  insert into head_coach_recommendations (task_id, client_id, context_snapshot_id, model, ai_output, backend_authority)
  values (v_task, v_client, v_snapshot, 'test-model', '{"status":"test"}'::jsonb, 'L1')
  returning id into v_rec;

  v_failed := false;
  begin
    update head_coach_context_snapshots set snapshot = '{"tampered": true}'::jsonb where id = v_snapshot;
  exception when others then v_failed := true; raise notice 'PASS: snapshot UPDATE blocked (%)', sqlerrm;
  end;
  if not v_failed then raise exception 'FAIL: snapshot UPDATE was NOT blocked'; end if;

  v_failed := false;
  begin
    update head_coach_recommendations set ai_output = '{"tampered": true}'::jsonb where id = v_rec;
  exception when others then v_failed := true; raise notice 'PASS: ai_output UPDATE blocked (%)', sqlerrm;
  end;
  if not v_failed then raise exception 'FAIL: ai_output UPDATE was NOT blocked'; end if;

  update head_coach_recommendations set status = 'approved', decided_by = v_client, decided_at = now() where id = v_rec;
  raise notice 'PASS: legitimate first decision update succeeded';

  v_failed := false;
  begin
    update head_coach_recommendations set coach_decision_note = 'second edit' where id = v_rec;
  exception when others then v_failed := true; raise notice 'PASS: post-decision UPDATE blocked (%)', sqlerrm;
  end;
  if not v_failed then raise exception 'FAIL: post-decision UPDATE was NOT blocked'; end if;

  v_failed := false;
  begin
    delete from head_coach_recommendations where id = v_rec;
  exception when others then v_failed := true; raise notice 'PASS: recommendation DELETE blocked (%)', sqlerrm;
  end;
  if not v_failed then raise exception 'FAIL: recommendation DELETE was NOT blocked'; end if;

  v_failed := false;
  begin
    delete from head_coach_tasks where id = v_task;
  exception when others then v_failed := true; raise notice 'PASS: task DELETE blocked by RESTRICT (%)', sqlerrm;
  end;
  if not v_failed then raise exception 'FAIL: task DELETE was NOT blocked'; end if;

  raise notice 'ALL TRIGGER/RESTRICT TESTS PASSED';
end $$;
rollback;
