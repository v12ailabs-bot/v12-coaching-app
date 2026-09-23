-- HC-002 catalog verification, combined into one result table.
-- Read-only, safe to run any time. Run this once and read every row of
-- the single results table it returns.

select 'enum' as kind, typname as name, 'exists' as detail
from pg_type where typname in ('head_coach_task_status','head_coach_recommendation_status')

union all
select 'table', table_name, 'exists'
from information_schema.tables
where table_schema='public' and table_name like 'head_coach_%'

union all
select 'index', indexname, 'on ' || tablename
from pg_indexes where tablename like 'head_coach_%'

union all
select 'rls_enabled', relname, relrowsecurity::text
from pg_class where relname like 'head_coach_%'

union all
select 'policy', tablename || '.' || policyname, cmd || ' / roles: ' || array_to_string(roles, ',')
from pg_policies where tablename like 'head_coach_%'

union all
select 'trigger', event_object_table || '.' || trigger_name, action_timing || ' ' || event_manipulation
from information_schema.triggers where event_object_table like 'head_coach_%'

union all
select 'function', proname, 'exists'
from pg_proc where proname like 'head_coach_%'

order by kind, name;
