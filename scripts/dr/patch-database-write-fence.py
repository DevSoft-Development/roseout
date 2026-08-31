from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


promotion = Path('.github/workflows/oregon-dr-promotion.yml')
p = promotion.read_text()

old_start = """          roles_sql=\"select rolname,coalesce(array_to_string(rolconfig,','),'') rolconfig from pg_roles where rolname in ('authenticator','supabase_auth_admin','supabase_storage_admin') order by rolname;\"
          query_ref \"$VIRGINIA_REF\" \"$roles_sql\" \"$RUNNER_TEMP/virginia-role-config.json\"
          test \"$(jq 'length' \"$RUNNER_TEMP/virginia-role-config.json\")\" = '3'
          jq -e 'all(.[]; (.rolconfig|contains(\"default_transaction_read_only\"))|not)' \"$RUNNER_TEMP/virginia-role-config.json\" >/dev/null || { echo 'Virginia write-fence roles already have a read-only override; refusing ambiguous promotion.' >&2; exit 1; }
"""
new_start = """          fence_state_sql=\"select (select count(*) from pg_db_role_setting s join pg_database d on d.oid=s.setdatabase where d.datname='postgres' and s.setrole=0 and coalesce(array_to_string(s.setconfig,','),'') like '%default_transaction_read_only=on%') database_fences,(select count(*) from pg_roles where rolname='postgres' and coalesce(array_to_string(rolconfig,','),'') like '%default_transaction_read_only=off%') admin_overrides,(select count(*) from pg_roles where rolname in ('authenticator','supabase_auth_admin','supabase_storage_admin') and coalesce(array_to_string(rolconfig,','),'') like '%default_transaction_read_only=off%') service_write_overrides;\"
          query_ref \"$VIRGINIA_REF\" \"$fence_state_sql\" \"$RUNNER_TEMP/virginia-fence-start.json\"
          jq -e '.[0].database_fences==0 and .[0].admin_overrides==0 and .[0].service_write_overrides==0' \"$RUNNER_TEMP/virginia-fence-start.json\" >/dev/null || { echo 'Virginia database write-fence state is not clean; refusing ambiguous promotion.' >&2; exit 1; }
"""
p = replace_once(p, old_start, new_start, 'promotion start fence check')

old_fence = """          query_ref \"alter role authenticator set default_transaction_read_only = on; alter role supabase_auth_admin set default_transaction_read_only = on; alter role supabase_storage_admin set default_transaction_read_only = on;\" \"$RUNNER_TEMP/fence-set.json\"
          query_ref \"select pg_terminate_backend(pid) terminated from pg_stat_activity where pid<>pg_backend_pid() and usename in ('authenticator','supabase_auth_admin','supabase_storage_admin');\" \"$RUNNER_TEMP/fence-terminate.json\"
          query_ref \"select rolname,coalesce(array_to_string(rolconfig,','),'') rolconfig from pg_roles where rolname in ('authenticator','supabase_auth_admin','supabase_storage_admin') order by rolname;\" \"$RUNNER_TEMP/fence-verify.json\"
          jq -e 'length==3 and all(.[]; .rolconfig|contains(\"default_transaction_read_only=on\"))' \"$RUNNER_TEMP/fence-verify.json\" >/dev/null || { echo 'Virginia database write fence did not apply.' >&2; exit 1; }
          printf '%s' true > \"$RUNNER_TEMP/virginia-fenced\"
"""
new_fence = """          query_ref \"alter role postgres set default_transaction_read_only=off; alter database postgres set default_transaction_read_only=on;\" \"$RUNNER_TEMP/fence-set.json\"
          query_ref \"select pg_terminate_backend(pid) terminated from pg_stat_activity where pid<>pg_backend_pid() and usename in ('authenticator','supabase_auth_admin','supabase_storage_admin');\" \"$RUNNER_TEMP/fence-terminate.json\"
          query_ref \"select (select count(*) from pg_db_role_setting s join pg_database d on d.oid=s.setdatabase where d.datname='postgres' and s.setrole=0 and coalesce(array_to_string(s.setconfig,','),'') like '%default_transaction_read_only=on%') database_fences,(select count(*) from pg_roles where rolname='postgres' and coalesce(array_to_string(rolconfig,','),'') like '%default_transaction_read_only=off%') admin_overrides,(select count(*) from pg_roles where rolname in ('authenticator','supabase_auth_admin','supabase_storage_admin') and coalesce(array_to_string(rolconfig,','),'') like '%default_transaction_read_only=off%') service_write_overrides;\" \"$RUNNER_TEMP/fence-verify.json\"
          jq -e '.[0].database_fences==1 and .[0].admin_overrides==1 and .[0].service_write_overrides==0' \"$RUNNER_TEMP/fence-verify.json\" >/dev/null || { echo 'Virginia database write fence did not apply.' >&2; exit 1; }
          printf '%s' true > \"$RUNNER_TEMP/virginia-fenced\"
"""
p = replace_once(p, old_fence, new_fence, 'promotion database fence')

old_recovery = """              jq -n --arg query \"alter role authenticator reset default_transaction_read_only; alter role supabase_auth_admin reset default_transaction_read_only; alter role supabase_storage_admin reset default_transaction_read_only;\" '{query:$query}' > \"$RUNNER_TEMP/unfence.json\"
              curl --fail --silent --show-error --request POST --header \"Authorization: Bearer $SUPABASE_ACCESS_TOKEN\" --header 'Content-Type: application/json' --data-binary \"@$RUNNER_TEMP/unfence.json\" \"https://api.supabase.com/v1/projects/${VIRGINIA_REF}/database/query\" >/dev/null || true
"""
new_recovery = """              jq -n --arg query \"alter database postgres reset default_transaction_read_only; alter role postgres reset default_transaction_read_only; select pg_terminate_backend(pid) from pg_stat_activity where pid<>pg_backend_pid() and usename in ('authenticator','supabase_auth_admin','supabase_storage_admin');\" '{query:$query}' > \"$RUNNER_TEMP/unfence.json\"
              curl --fail --silent --show-error --request POST --header \"Authorization: Bearer $SUPABASE_ACCESS_TOKEN\" --header 'Content-Type: application/json' --data-binary \"@$RUNNER_TEMP/unfence.json\" \"https://api.supabase.com/v1/projects/${VIRGINIA_REF}/database/query\" >/dev/null || true
"""
p = replace_once(p, old_recovery, new_recovery, 'promotion fail-safe unfence')
promotion.write_text(p)

failback = Path('scripts/dr/oregon-failback.sh')
s = failback.read_text()

old_funcs = """fence_roles() {
  local ref=\"$1\" out=\"$2\"
  query_ref \"$ref\" \\
    \"alter role authenticator set default_transaction_read_only=on; alter role supabase_auth_admin set default_transaction_read_only=on; alter role supabase_storage_admin set default_transaction_read_only=on; select pg_terminate_backend(pid) from pg_stat_activity where pid<>pg_backend_pid() and usename in ('authenticator','supabase_auth_admin','supabase_storage_admin');\" \\
    \"$out\"
}

unfence_roles() {
  local ref=\"$1\" out=\"$2\"
  query_ref \"$ref\" \\
    \"alter role authenticator reset default_transaction_read_only; alter role supabase_auth_admin reset default_transaction_read_only; alter role supabase_storage_admin reset default_transaction_read_only;\" \\
    \"$out\"
}
"""
new_funcs = """fence_roles() {
  local ref=\"$1\" out=\"$2\"
  query_ref \"$ref\" \\
    \"alter role postgres set default_transaction_read_only=off; alter database postgres set default_transaction_read_only=on; select pg_terminate_backend(pid) from pg_stat_activity where pid<>pg_backend_pid() and usename in ('authenticator','supabase_auth_admin','supabase_storage_admin');\" \\
    \"$out\"
  query_ref \"$ref\" \\
    \"select (select count(*) from pg_db_role_setting s join pg_database d on d.oid=s.setdatabase where d.datname='postgres' and s.setrole=0 and coalesce(array_to_string(s.setconfig,','),'') like '%default_transaction_read_only=on%') database_fences,(select count(*) from pg_roles where rolname='postgres' and coalesce(array_to_string(rolconfig,','),'') like '%default_transaction_read_only=off%') admin_overrides,(select count(*) from pg_roles where rolname in ('authenticator','supabase_auth_admin','supabase_storage_admin') and coalesce(array_to_string(rolconfig,','),'') like '%default_transaction_read_only=off%') service_write_overrides;\" \\
    \"$TMP/fence-verify.json\"
  jq -e '.[0].database_fences==1 and .[0].admin_overrides==1 and .[0].service_write_overrides==0' \"$TMP/fence-verify.json\" >/dev/null
}

unfence_roles() {
  local ref=\"$1\" out=\"$2\"
  query_ref \"$ref\" \\
    \"alter database postgres reset default_transaction_read_only; alter role postgres reset default_transaction_read_only; select pg_terminate_backend(pid) from pg_stat_activity where pid<>pg_backend_pid() and usename in ('authenticator','supabase_auth_admin','supabase_storage_admin');\" \\
    \"$out\"
}
"""
s = replace_once(s, old_funcs, new_funcs, 'failback fence helpers')

old_verify = """  roles_sql=\"select rolname,coalesce(array_to_string(rolconfig,','),'') rolconfig from pg_roles where rolname in ('authenticator','supabase_auth_admin','supabase_storage_admin') order by rolname;\"
  query_ref \"$VIRGINIA_REF\" \"$roles_sql\" \"$TMP/virginia-fence.json\"
  test \"$(jq 'length' \"$TMP/virginia-fence.json\")\" = '3'
  jq -e 'all(.[]; .rolconfig|contains(\"default_transaction_read_only=on\"))' \"$TMP/virginia-fence.json\" >/dev/null || {
    echo 'Virginia is not fully fenced from application/Auth/Storage writes.' >&2
    exit 1
  }
"""
new_verify = """  roles_sql=\"select (select count(*) from pg_db_role_setting s join pg_database d on d.oid=s.setdatabase where d.datname='postgres' and s.setrole=0 and coalesce(array_to_string(s.setconfig,','),'') like '%default_transaction_read_only=on%') database_fences,(select count(*) from pg_roles where rolname='postgres' and coalesce(array_to_string(rolconfig,','),'') like '%default_transaction_read_only=off%') admin_overrides,(select count(*) from pg_roles where rolname in ('authenticator','supabase_auth_admin','supabase_storage_admin') and coalesce(array_to_string(rolconfig,','),'') like '%default_transaction_read_only=off%') service_write_overrides;\"
  query_ref \"$VIRGINIA_REF\" \"$roles_sql\" \"$TMP/virginia-fence.json\"
  jq -e '.[0].database_fences==1 and .[0].admin_overrides==1 and .[0].service_write_overrides==0' \"$TMP/virginia-fence.json\" >/dev/null || {
    echo 'Virginia is not fully fenced from application/Auth/Storage writes.' >&2
    exit 1
  }
"""
s = replace_once(s, old_verify, new_verify, 'failback Virginia fence prerequisite')

subscriber_anchor = """    grant pg_create_subscription to ${FAILBACK_SUBSCRIBER_ROLE};
    grant create on database postgres to ${FAILBACK_SUBSCRIBER_ROLE};
"""
subscriber_new = """    grant pg_create_subscription to ${FAILBACK_SUBSCRIBER_ROLE};
    alter role ${FAILBACK_SUBSCRIBER_ROLE} set default_transaction_read_only=off;
    grant create on database postgres to ${FAILBACK_SUBSCRIBER_ROLE};
"""
s = replace_once(s, subscriber_anchor, subscriber_new, 'failback subscriber write override')
failback.write_text(s)
