#!/usr/bin/env bash
set -euo pipefail

# Resume the failback only from the exact forward-ready, fail-closed checkpoint
# reached after Virginia -> Oregon logical replication was rebuilt successfully.
source <(sed '/^main "\$@"$/d' scripts/dr/oregon-failback.sh)

CONFIRM_FORWARD_READY="RECOVER_FORWARD_READY_VIRGINIA"

require_forward_ready_inputs() {
  require_tools
  test -n "${SUPABASE_ACCESS_TOKEN:-}" || { echo 'Missing SUPABASE_ACCESS_TOKEN.' >&2; exit 1; }
  test -n "${VERCEL_TOKEN:-}" || { echo 'Missing VERCEL_TOKEN.' >&2; exit 1; }
  test -n "${OREGON_DB_URL:-}" || { echo 'Missing OREGON_DB_URL.' >&2; exit 1; }
  case "$OREGON_DB_URL" in *"$OREGON_REF"*) ;; *) echo 'OREGON_DB_URL is not scoped to Oregon DR.' >&2; exit 1 ;; esac
  test "${CONFIRMATION:-}" = "$CONFIRM_FORWARD_READY" || {
    echo "Forward-ready recovery requires CONFIRMATION=$CONFIRM_FORWARD_READY." >&2
    exit 1
  }
}

verify_forward_ready_checkpoint() {
  local expected candidate_fp va_fp or_fp

  test "$(aws sts get-caller-identity --query Account --output text)" = "$AWS_ACCOUNT_ID"
  test "$(verify_manifest_state "$BASE_MANIFEST" DISABLED)" = '24'
  test "$(verify_manifest_state "$DR_MANIFEST" DISABLED)" = '2'

  aws secretsmanager get-secret-value --secret-id "$DR_SECRET_NAME" --query SecretString --output text > "$TMP/dr-start.json"
  jq -e '.DR_MODE=="failback_in_progress"' "$TMP/dr-start.json" >/dev/null || {
    echo 'Forward-ready recovery requires DR_MODE=failback_in_progress.' >&2
    exit 1
  }

  aws secretsmanager get-secret-value --secret-id "$RUNTIME_SECRET_NAME" --query SecretString --output text > "$TMP/runtime-start.json"
  test "$(jq -r '.SUPABASE_URL // empty' "$TMP/runtime-start.json")" = "$OREGON_URL" || {
    echo 'Forward-ready recovery requires AWS runtime to still target Oregon.' >&2
    exit 1
  }

  curl --fail --silent --show-error --header "Authorization: Bearer $VERCEL_TOKEN" \
    "https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env?teamId=${VERCEL_TEAM_ID}&decrypt=true" > "$TMP/vercel-env-start.json"
  test "$(resolve_vercel_public_url "$TMP/vercel-env-start.json" "$TMP/vercel-env-start-detail.json" || true)" = "$OREGON_URL" || {
    echo 'Forward-ready recovery requires Vercel production to still target Oregon.' >&2
    exit 1
  }

  query_ref "$VIRGINIA_REF" "$(candidate_sql)" "$TMP/va-candidates.json"
  query_ref "$OREGON_REF" "$(candidate_sql)" "$TMP/or-candidates.json"
  cmp -s <(jq -S '.[0]' "$TMP/va-candidates.json") <(jq -S '.[0]' "$TMP/or-candidates.json") || {
    echo 'Public table inventory differs at the forward-ready checkpoint.' >&2
    exit 1
  }
  expected="$(jq -r '.[0].candidate_tables' "$TMP/va-candidates.json")"
  candidate_fp="$(jq -r '.[0].candidate_fp' "$TMP/va-candidates.json")"
  test "$expected" -gt 0

  query_ref "$VIRGINIA_REF" \
    "select (select count(*) from cron.job) cron_jobs,(select count(*) from pg_subscription where subname='${FAILBACK_SUBSCRIPTION}') reverse_subscriptions,(select count(*) from pg_replication_slots where slot_name='${FORWARD_SLOT}') forward_slots,(select count(*) from pg_replication_slots where slot_name='${FORWARD_SLOT}' and active) active_forward_slots,coalesce((select pg_wal_lsn_diff(pg_current_wal_lsn(),confirmed_flush_lsn)::bigint from pg_replication_slots where slot_name='${FORWARD_SLOT}'),-1) forward_lag_bytes,(select count(*) from pg_db_role_setting s join pg_database d on d.oid=s.setdatabase where d.datname='postgres' and s.setrole=0 and coalesce(array_to_string(s.setconfig,','),'') like '%default_transaction_read_only=on%') database_fences,(select count(*) from pg_auth_members m where m.roleid=(select oid from pg_roles where rolname='${FAILBACK_SUBSCRIBER_ROLE}') and m.member=(select oid from pg_roles where rolname='postgres') and m.grantor=(select oid from pg_roles where rolname='postgres')) temporary_set_grants,(select count(*) from pg_roles where rolname='${FAILBACK_SUBSCRIBER_ROLE}' and rolcanlogin) old_role_login_enabled,(select count(*) from pg_roles where rolname='${FAILBACK_SUBSCRIBER_ROLE}' and rolreplication) old_role_replication_enabled,(select count(*) from pg_roles where rolname='${FAILBACK_SUBSCRIBER_ROLE}' and rolbypassrls) old_role_bypassrls_enabled,(select count(*) from pg_auth_members m where m.member=(select oid from pg_roles where rolname='${FAILBACK_SUBSCRIBER_ROLE}') and pg_get_userbyid(m.roleid)='pg_create_subscription') create_subscription_memberships;" \
    "$TMP/va-forward-ready.json"
  jq -e 'length==1 and .[0].cron_jobs==0 and .[0].reverse_subscriptions==0 and .[0].forward_slots==1 and .[0].active_forward_slots==1 and .[0].forward_lag_bytes==0 and .[0].database_fences==1 and .[0].temporary_set_grants==0 and .[0].old_role_login_enabled==0 and .[0].old_role_replication_enabled==0 and .[0].old_role_bypassrls_enabled==0 and .[0].create_subscription_memberships==0' "$TMP/va-forward-ready.json" >/dev/null || {
    echo 'Virginia does not match the guarded forward-ready checkpoint.' >&2
    cat "$TMP/va-forward-ready.json" >&2
    exit 1
  }

  query_ref "$VIRGINIA_REF" \
    "with p as (select schemaname||'.'||tablename rel from pg_publication_tables where pubname='${FORWARD_PUBLICATION}') select count(*) published_tables,md5(coalesce(string_agg(rel,',' order by rel),'')) published_fp from p;" \
    "$TMP/va-forward-publication.json"
  jq -e --argjson expected "$expected" --arg fp "$candidate_fp" 'length==1 and .[0].published_tables==$expected and .[0].published_fp==$fp' "$TMP/va-forward-publication.json" >/dev/null || {
    echo 'Virginia forward publication does not match the public table inventory.' >&2
    exit 1
  }

  query_ref "$OREGON_REF" \
    "select (select count(*) from cron.job where active) active_cron_jobs,(select count(*) from pg_subscription where subname='${FORWARD_SUBSCRIPTION}') forward_subscriptions,(select count(*) from pg_subscription where subname='${FORWARD_SUBSCRIPTION}' and subenabled) enabled_forward_subscriptions,(select count(*) from pg_stat_subscription where subname='${FORWARD_SUBSCRIPTION}' and pid is not null) forward_workers,(select count(*) from pg_subscription_rel sr join pg_subscription s on s.oid=sr.srsubid where s.subname='${FORWARD_SUBSCRIPTION}') relation_count,(select count(*) from pg_subscription_rel sr join pg_subscription s on s.oid=sr.srsubid where s.subname='${FORWARD_SUBSCRIPTION}' and sr.srsubstate='r') ready_count,(select count(*) from pg_replication_slots where slot_name='${FAILBACK_SLOT}') reverse_slots,(select count(*) from pg_publication where pubname='${FAILBACK_PUBLICATION}') reverse_publications,(select count(*) from pg_roles where rolname='${FAILBACK_REPLICATION_ROLE}') reverse_role_count,(select count(*) from pg_shdepend d where d.refclassid='pg_authid'::regclass and d.refobjid=(select oid from pg_roles where rolname='${FAILBACK_REPLICATION_ROLE}') and d.deptype='o') reverse_role_owner_dependencies,(select count(*) from pg_db_role_setting s join pg_database d on d.oid=s.setdatabase where d.datname='postgres' and s.setrole=0 and coalesce(array_to_string(s.setconfig,','),'') like '%default_transaction_read_only=on%') database_fences;" \
    "$TMP/or-forward-ready.json"
  jq -e --argjson expected "$expected" 'length==1 and .[0].active_cron_jobs==0 and .[0].forward_subscriptions==1 and .[0].enabled_forward_subscriptions==1 and .[0].forward_workers==1 and .[0].relation_count==$expected and .[0].ready_count==$expected and .[0].reverse_slots==0 and .[0].reverse_publications==1 and .[0].reverse_role_count==1 and .[0].reverse_role_owner_dependencies==0 and .[0].database_fences==1' "$TMP/or-forward-ready.json" >/dev/null || {
    echo 'Oregon does not match the guarded forward-ready checkpoint.' >&2
    cat "$TMP/or-forward-ready.json" >&2
    exit 1
  }

  query_ref "$VIRGINIA_REF" "$(public_data_sql)" "$TMP/va-forward-ready-data.json"
  query_ref "$OREGON_REF" "$(public_data_sql)" "$TMP/or-forward-ready-data.json"
  va_fp="$(jq -r '.[0] | [.table_count,.total_rows,.data_fingerprint] | @tsv' "$TMP/va-forward-ready-data.json")"
  or_fp="$(jq -r '.[0] | [.table_count,.total_rows,.data_fingerprint] | @tsv' "$TMP/or-forward-ready-data.json")"
  test "$va_fp" = "$or_fp" || {
    echo 'Exact public data parity changed after the forward lane was rebuilt.' >&2
    exit 1
  }
}

neutralize_obsolete_reverse_source() {
  query_ref "$OREGON_REF" \
    "drop publication if exists ${FAILBACK_PUBLICATION}; alter role ${FAILBACK_REPLICATION_ROLE} with nologin noreplication nobypassrls password null;" \
    "$TMP/reverse-source-neutralized.json"

  query_ref "$OREGON_REF" \
    "select (select count(*) from pg_publication where pubname='${FAILBACK_PUBLICATION}') reverse_publications,(select count(*) from pg_roles where rolname='${FAILBACK_REPLICATION_ROLE}' and rolcanlogin) login_enabled,(select count(*) from pg_roles where rolname='${FAILBACK_REPLICATION_ROLE}' and rolreplication) replication_enabled,(select count(*) from pg_roles where rolname='${FAILBACK_REPLICATION_ROLE}' and rolbypassrls) bypassrls_enabled;" \
    "$TMP/reverse-source-neutralized-verify.json"
  jq -e 'length==1 and .[0].reverse_publications==0 and .[0].login_enabled==0 and .[0].replication_enabled==0 and .[0].bypassrls_enabled==0' "$TMP/reverse-source-neutralized-verify.json" >/dev/null || {
    echo 'Obsolete Oregon reverse replication source was not safely neutralized.' >&2
    exit 1
  }
}

forward_ready_recovery() {
  require_forward_ready_inputs
  verify_forward_ready_checkpoint
  resolve_project_keys
  neutralize_obsolete_reverse_source

  # The original post-detach recovery had already written failback_in_progress to
  # Secrets Manager, but its local transition file was lost with the failed runner.
  # Recreate that local state from the authoritative DR secret before the switch.
  jq '.DR_MODE="failback_in_progress"' "$TMP/dr-start.json" > "$TMP/dr-transition.json"

  switch_runtime_vercel_to_virginia
  restore_forward_dr

  {
    echo '### Oregon DR forward-ready recovery'
    echo ''
    echo '- Forward-ready fail-closed checkpoint: verified.'
    echo '- Virginia -> Oregon public replication: 0-byte lag and fully ready.'
    echo '- Obsolete Oregon reverse publication: removed.'
    echo '- Obsolete reverse replication roles: inert.'
    echo '- Virginia: restored as writable production primary.'
    echo '- Oregon: restored as passive cross-region standby.'
  } >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
}

forward_ready_recovery
