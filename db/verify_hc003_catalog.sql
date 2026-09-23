-- HC-003 catalog verification. Read-only, safe to run any time.
select 'function' as kind, proname as name, 'exists' as detail
from pg_proc where proname = 'profiles_protect_privileged_columns'
union all
select 'trigger', trigger_name, action_timing || ' ' || event_manipulation
from information_schema.triggers where event_object_table = 'profiles' and trigger_name = 'profiles_protect_privileged_columns';
