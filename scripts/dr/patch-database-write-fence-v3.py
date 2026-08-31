from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    return text.replace(old, new, 1)


def replace_between(text, start, end, replacement, label):
    a = text.find(start)
    if a < 0:
        raise SystemExit(f"{label}: start marker not found")
    b = text.find(end, a)
    if b < 0:
        raise SystemExit(f"{label}: end marker not found")
    return text[:a] + replacement + text[b:]


promotion = Path('.github/workflows/oregon-dr-promotion.yml')
p = promotion.read_text()
p = replace_between(
    p,
    '          roles_sql="select rolname,coalesce(array_to_string(rolconfig',
    '\n\n      - name: Resolve both project API keys without logging them',
    '''          fence_state_sql="select (select count(*) from pg_db_role_setting s join pg_database d on d.oid=s.setdatabase where d.datname='postgres' and s.setrole=0 and coalesce(array_to_string(s.setconfig,','),'') like '%default_transaction_read_only=on%') database_fences,(select count(*) from pg_roles where rolname='postgres' and coalesce(array_to_string(rolconfig,','),'') like '%default_transaction_read_only=off%') admin_overrides,(select count(*) from pg_roles where rolname in ('authenticator','supabase_auth_admin','supabase_storage_admin') and coalesce(array_to_string(rolconfig,','),'') like '%default_transaction_read_only=off%') service_write_overrides;"
          query_ref "$VIRGINIA_REF" "$fence_state_sql" "$RUNNER_TEMP/virginia-fence-start.json"
          jq -e '.[0].database_fences==0 and .[0].admin_overrides==0 and .[0].service_write_overrides==0' "$RUNNER_TEMP/virginia-fence-start.json" >/dev/null || { echo 'Virginia database write-fence state is not clean; refusing ambiguous promotion.' >&2; exit 1; }
''',
    'promotion start fence check',
)
p = replace_once(
    p,
    '          query_ref "alter role authenticator set default_transaction_read_only = on; alter role supabase_auth_admin set default_transaction_read_only = on; alter role supabase_storage_admin set default_transaction_read_only = on;" "$RUNNER_TEMP/fence-set.json"\n',
    '          query_ref "alter role postgres set default_transaction_read_only=off; alter database postgres set default_transaction_read_only=on;" "$RUNNER_TEMP/fence-set.json"\n',
    'promotion fence set',
)
p = replace_once(
    p,
    '          query_ref "select rolname,coalesce(array_to_string(rolconfig,\',\'),\'\') rolconfig from pg_roles where rolname in (\'authenticator\',\'supabase_auth_admin\',\'supabase_storage_admin\') order by rolname;" "$RUNNER_TEMP/fence-verify.json"\n          jq -e \'length==3 and all(.[]; .rolconfig|contains("default_transaction_read_only=on"))\' "$RUNNER_TEMP/fence-verify.json" >/dev/null || { echo \'Virginia database write fence did not apply.\' >&2; exit 1; }\n',
    '          query_ref "select (select count(*) from pg_db_role_setting s join pg_database d on d.oid=s.setdatabase where d.datname=\'postgres\' and s.setrole=0 and coalesce(array_to_string(s.setconfig,\',\'),\'\') like \'%default_transaction_read_only=on%\') database_fences,(select count(*) from pg_roles where rolname=\'postgres\' and coalesce(array_to_string(rolconfig,\',\'),\'\') like \'%default_transaction_read_only=off%\') admin_overrides,(select count(*) from pg_roles where rolname in (\'authenticator\',\'supabase_auth_admin\',\'supabase_storage_admin\') and coalesce(array_to_string(rolconfig,\',\'),\'\') like \'%default_transaction_read_only=off%\') service_write_overrides;" "$RUNNER_TEMP/fence-verify.json"\n          jq -e \'.[0].database_fences==1 and .[0].admin_overrides==1 and .[0].service_write_overrides==0\' "$RUNNER_TEMP/fence-verify.json" >/dev/null || { echo \'Virginia database write fence did not apply.\' >&2; exit 1; }\n',
    'promotion fence verify',
)
p = replace_once(
    p,
    'alter role authenticator reset default_transaction_read_only; alter role supabase_auth_admin reset default_transaction_read_only; alter role supabase_storage_admin reset default_transaction_read_only;',
    "alter database postgres reset default_transaction_read_only; alter role postgres reset default_transaction_read_only; select pg_terminate_backend(pid) from pg_stat_activity where pid<>pg_backend_pid() and usename in ('authenticator','supabase_auth_admin','supabase_storage_admin');",
    'promotion recovery unfence',
)
promotion.write_text(p)

failback = Path('scripts/dr/oregon-failback.sh')
s = failback.read_text()
helpers = '''fence_roles() {
  local ref="$1" out="$2"
  query_ref "$ref" \\
    "alter role postgres set default_transaction_read_only=off; alter database postgres set default_transaction_read_only=on; select pg_terminate_backend(pid) from pg_stat_activity where pid<>pg_backend_pid() and usename in ('authenticator','supabase_auth_admin','supabase_storage_admin');" \\
    "$out"
  query_ref "$ref" \\
    "select (select count(*) from pg_db_role_setting s join pg_database d on d.oid=s.setdatabase where d.datname='postgres' and s.setrole=0 and coalesce(array_to_string(s.setconfig,','),'') like '%default_transaction_read_only=on%') database_fences,(select count(*) from pg_roles where rolname='postgres' and coalesce(array_to_string(rolconfig,','),'') like '%default_transaction_read_only=off%') admin_overrides,(select count(*) from pg_roles where rolname in ('authenticator','supabase_auth_admin','supabase_storage_admin') and coalesce(array_to_string(rolconfig,','),'') like '%default_transaction_read_only=off%') service_write_overrides;" \\
    "$TMP/fence-verify.json"
  jq -e '.[0].database_fences==1 and .[0].admin_overrides==1 and .[0].service_write_overrides==0' "$TMP/fence-verify.json" >/dev/null
}

unfence_roles() {
  local ref="$1" out="$2"
  query_ref "$ref" \\
    "alter database postgres reset default_transaction_read_only; alter role postgres reset default_transaction_read_only; select pg_terminate_backend(pid) from pg_stat_activity where pid<>pg_backend_pid() and usename in ('authenticator','supabase_auth_admin','supabase_storage_admin');" \\
    "$out"
}

'''
s = replace_between(s, 'fence_roles() {', 'candidate_sql() {', helpers, 'failback fence helpers')
verify = '''  roles_sql="select (select count(*) from pg_db_role_setting s join pg_database d on d.oid=s.setdatabase where d.datname='postgres' and s.setrole=0 and coalesce(array_to_string(s.setconfig,','),'') like '%default_transaction_read_only=on%') database_fences,(select count(*) from pg_roles where rolname='postgres' and coalesce(array_to_string(rolconfig,','),'') like '%default_transaction_read_only=off%') admin_overrides,(select count(*) from pg_roles where rolname in ('authenticator','supabase_auth_admin','supabase_storage_admin') and coalesce(array_to_string(rolconfig,','),'') like '%default_transaction_read_only=off%') service_write_overrides;"
  query_ref "$VIRGINIA_REF" "$roles_sql" "$TMP/virginia-fence.json"
  jq -e '.[0].database_fences==1 and .[0].admin_overrides==1 and .[0].service_write_overrides==0' "$TMP/virginia-fence.json" >/dev/null || {
    echo 'Virginia is not fully fenced from application/Auth/Storage writes.' >&2
    exit 1
  }
'''
s = replace_between(s, '  roles_sql="select rolname,coalesce(array_to_string(rolconfig', '\n}\n\nwait_reverse_ready() {', verify, 'failback prepare fence verify')
s = replace_once(
    s,
    '    grant pg_create_subscription to ${FAILBACK_SUBSCRIBER_ROLE};\n',
    '    grant pg_create_subscription to ${FAILBACK_SUBSCRIBER_ROLE};\n    alter role ${FAILBACK_SUBSCRIBER_ROLE} set default_transaction_read_only=off;\n',
    'failback subscriber override',
)
failback.write_text(s)
