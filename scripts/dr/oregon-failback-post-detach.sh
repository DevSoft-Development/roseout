#!/usr/bin/env bash
set -euo pipefail

# Reuse the already-reviewed failback helpers without invoking its normal entrypoint.
# The post-detach recovery has a deliberately narrower start contract because the
# reverse Oregon -> Virginia subscription and slot were already removed successfully.
source <(sed '/^main "\$@"$/d' scripts/dr/oregon-failback.sh)

CONFIRM_POST_DETACH="RECOVER_POST_DETACH_VIRGINIA"

require_post_detach_inputs() {
  require_tools
  test -n "${SUPABASE_ACCESS_TOKEN:-}" || { echo 'Missing SUPABASE_ACCESS_TOKEN.' >&2; exit 1; }
  test -n "${VERCEL_TOKEN:-}" || { echo 'Missing VERCEL_TOKEN.' >&2; exit 1; }
  test -n "${OREGON_DB_URL:-}" || { echo 'Missing OREGON_DB_URL.' >&2; exit 1; }
  case "$OREGON_DB_URL" in *"$OREGON_REF"*) ;; *) echo 'OREGON_DB_URL is not scoped to Oregon DR.' >&2; exit 1 ;; esac
  test "${CONFIRMATION:-}" = "$CONFIRM_POST_DETACH" || {
    echo "Post-detach recovery requires CONFIRMATION=$CONFIRM_POST_DETACH." >&2
    exit 1
  }
}

verify_post_detach_checkpoint() {
  local va_fp or_fp

  test "$(aws sts get-caller-identity --query Account --output text)" = "$AWS_ACCOUNT_ID"
  test "$(verify_manifest_state "$BASE_MANIFEST" DISABLED)" = '24'
  test "$(verify_manifest_state "$DR_MANIFEST" DISABLED)" = '2'

  aws secretsmanager get-secret-value --secret-id "$DR_SECRET_NAME" --query SecretString --output text > "$TMP/dr-start.json"
  jq -e '.DR_MODE=="failback_in_progress"' "$TMP/dr-start.json" >/dev/null || {
    echo 'Post-detach recovery requires DR_MODE=failback_in_progress.' >&2
    exit 1
  }

  aws secretsmanager get-secret-value --secret-id "$RUNTIME_SECRET_NAME" --query SecretString --output text > "$TMP/runtime-start.json"
  test "$(jq -r '.SUPABASE_URL // empty' "$TMP/runtime-start.json")" = "$OREGON_URL" || {
    echo 'Post-detach recovery requires AWS runtime to still target Oregon.' >&2
    exit 1
  }

  curl --fail --silent --show-error --header "Authorization: Bearer $VERCEL_TOKEN" \
    "https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env?teamId=${VERCEL_TEAM_ID}&decrypt=true" > "$TMP/vercel-env-start.json"
  test "$(resolve_vercel_public_url "$TMP/vercel-env-start.json" "$TMP/vercel-env-start-detail.json" || true)" = "$OREGON_URL" || {
    echo 'Post-detach recovery requires Vercel production to still target Oregon.' >&2
    exit 1
  }

  query_ref "$VIRGINIA_REF" \
    "select (select count(*) from cron.job) cron_jobs,(select count(*) from pg_subscription where subname='${FAILBACK_SUBSCRIPTION}') reverse_subscriptions,(select count(*) from pg_replication_slots where slot_name='${FORWARD_SLOT}') forward_slots,(select count(*) from pg_db_role_setting s join pg_database d on d.oid=s.setdatabase where d.datname='postgres' and s.setrole=0 and coalesce(array_to_string(s.setconfig,','),'') like '%default_transaction_read_only=on%') database_fences,(select count(*) from pg_auth_members m where m.roleid=(select oid from pg_roles where rolname='${FAILBACK_SUBSCRIBER_ROLE}') and m.member=(select oid from pg_roles where rolname='postgres') and m.grantor=(select oid from pg_roles where rolname='postgres')) temporary_set_grants;" \
    "$TMP/va-post-detach.json"
  jq -e 'length==1 and .[0].cron_jobs==0 and .[0].reverse_subscriptions==0 and .[0].forward_slots==0 and .[0].database_fences==1 and .[0].temporary_set_grants==0' "$TMP/va-post-detach.json" >/dev/null || {
    echo 'Virginia does not match the guarded post-detach checkpoint.' >&2
    cat "$TMP/va-post-detach.json" >&2
    exit 1
  }

  query_ref "$OREGON_REF" \
    "select (select count(*) from cron.job where active) active_cron_jobs,(select count(*) from pg_subscription where subname='${FORWARD_SUBSCRIPTION}') forward_subscriptions,(select count(*) from pg_replication_slots where slot_name='${FAILBACK_SLOT}') reverse_slots,(select count(*) from pg_db_role_setting s join pg_database d on d.oid=s.setdatabase where d.datname='postgres' and s.setrole=0 and coalesce(array_to_string(s.setconfig,','),'') like '%default_transaction_read_only=on%') database_fences;" \
    "$TMP/or-post-detach.json"
  jq -e 'length==1 and .[0].active_cron_jobs==0 and .[0].forward_subscriptions==0 and .[0].reverse_slots==0 and .[0].database_fences==1' "$TMP/or-post-detach.json" >/dev/null || {
    echo 'Oregon does not match the guarded post-detach checkpoint.' >&2
    cat "$TMP/or-post-detach.json" >&2
    exit 1
  }

  # Both databases have remained fenced since the zero-lag detach. Recheck exact
  # public data parity before creating a new replication direction.
  query_ref "$VIRGINIA_REF" "$(public_data_sql)" "$TMP/va-post-detach-data.json"
  query_ref "$OREGON_REF" "$(public_data_sql)" "$TMP/or-post-detach-data.json"
  va_fp="$(jq -r '.[0] | [.table_count,.total_rows,.data_fingerprint] | @tsv' "$TMP/va-post-detach-data.json")"
  or_fp="$(jq -r '.[0] | [.table_count,.total_rows,.data_fingerprint] | @tsv' "$TMP/or-post-detach-data.json")"
  test "$va_fp" = "$or_fp" || {
    echo 'Public data parity changed after reverse detach; refusing recovery.' >&2
    exit 1
  }
}

neutralize_reverse_subscriber_role() {
  # The original recovery revoked its temporary SET grant too early. Hosted
  # Supabase postgres is CREATEROLE but not superuser, and DROP OWNED BY requires
  # SET capability for the target role. Keep a narrow temporary grant through
  # DROP OWNED, then leave the obsolete role inert instead of risking another
  # shared-role drop dependency during this production recovery.
  query_ref "$VIRGINIA_REF" \
    "grant ${FAILBACK_SUBSCRIBER_ROLE} to postgres with inherit false, set true; drop owned by ${FAILBACK_SUBSCRIBER_ROLE}; revoke pg_create_subscription from ${FAILBACK_SUBSCRIBER_ROLE}; alter role ${FAILBACK_SUBSCRIBER_ROLE} with nologin noreplication nobypassrls password null; revoke ${FAILBACK_SUBSCRIBER_ROLE} from postgres granted by postgres;" \
    "$TMP/reverse-role-neutralized.json"

  query_ref "$VIRGINIA_REF" \
    "select (select count(*) from pg_auth_members m where m.roleid=(select oid from pg_roles where rolname='${FAILBACK_SUBSCRIBER_ROLE}') and m.member=(select oid from pg_roles where rolname='postgres') and m.grantor=(select oid from pg_roles where rolname='postgres')) temporary_set_grants,(select count(*) from pg_auth_members m where m.member=(select oid from pg_roles where rolname='${FAILBACK_SUBSCRIBER_ROLE}') and pg_get_userbyid(m.roleid)='pg_create_subscription') create_subscription_memberships,(select count(*) from pg_shdepend d where d.refclassid='pg_authid'::regclass and d.refobjid=(select oid from pg_roles where rolname='${FAILBACK_SUBSCRIBER_ROLE}') and d.deptype='a' and d.classid in ('pg_class'::regclass,'pg_namespace'::regclass,'pg_proc'::regclass)) acl_dependencies,(select rolcanlogin from pg_roles where rolname='${FAILBACK_SUBSCRIBER_ROLE}') can_login,(select rolbypassrls from pg_roles where rolname='${FAILBACK_SUBSCRIBER_ROLE}') bypass_rls;" \
    "$TMP/reverse-role-neutralized-verify.json"
  jq -e 'length==1 and .[0].temporary_set_grants==0 and .[0].create_subscription_memberships==0 and .[0].acl_dependencies==0 and .[0].can_login==false and .[0].bypass_rls==false' "$TMP/reverse-role-neutralized-verify.json" >/dev/null || {
    echo 'Reverse subscriber role was not safely neutralized.' >&2
    cat "$TMP/reverse-role-neutralized-verify.json" >&2
    exit 1
  }
}

rebuild_forward_lane_only() {
  local forward_password expected ready=false

  query_ref "$OREGON_REF" \
    "select count(*) subscriptions from pg_subscription where subname='${FORWARD_SUBSCRIPTION}';" \
    "$TMP/forward-sub-before.json"
  test "$(jq -r '.[0].subscriptions' "$TMP/forward-sub-before.json")" = '0' || {
    echo 'Forward Oregon subscription already exists unexpectedly.' >&2
    exit 1
  }

  forward_password="$(openssl rand -hex 32)"
  echo "::add-mask::$forward_password"
  printf '%s' "$forward_password" > "$TMP/forward-password"
  chmod 600 "$TMP/forward-password"

  cat > "$TMP/forward-source.sql" <<SQL
  do \$dr\$
  declare rels text;
  begin
    if exists(select 1 from pg_roles where rolname='${FORWARD_REPLICATION_ROLE}') then
      execute format('alter role %I with login replication bypassrls password %L','${FORWARD_REPLICATION_ROLE}','${forward_password}');
    else
      execute format('create role %I with login replication bypassrls password %L','${FORWARD_REPLICATION_ROLE}','${forward_password}');
    end if;
    grant connect on database postgres to ${FORWARD_REPLICATION_ROLE};
    grant usage on schema public to ${FORWARD_REPLICATION_ROLE};
    grant select on all tables in schema public to ${FORWARD_REPLICATION_ROLE};
    if not exists(select 1 from pg_publication where pubname='${FORWARD_PUBLICATION}') then
      select string_agg(format('%I.%I',n.nspname,c.relname),', ' order by c.relname) into rels
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where c.relkind='r' and n.nspname='public'
        and c.relname not in ('toh_region_migration_apply_errors','toh_storage_migration_manifest');
      if rels is null then raise exception 'Forward DR publication set is empty'; end if;
      execute format('create publication %I for table %s','${FORWARD_PUBLICATION}',rels);
    end if;
  end
  \$dr\$;
SQL
  query_ref "$VIRGINIA_REF" "$(cat "$TMP/forward-source.sql")" "$TMP/forward-source.json"

  query_ref "$VIRGINIA_REF" "$(candidate_sql)" "$TMP/forward-candidates.json"
  expected="$(jq -r '.[0].candidate_tables' "$TMP/forward-candidates.json")"
  test "$expected" -gt 0

  cat > "$TMP/create-forward-subscription.sql" <<SQL
  create subscription ${FORWARD_SUBSCRIPTION}
  connection 'host=db.${VIRGINIA_REF}.supabase.co port=5432 dbname=postgres user=${FORWARD_REPLICATION_ROLE} password=${forward_password} sslmode=require application_name=${FORWARD_SUBSCRIPTION}'
  publication ${FORWARD_PUBLICATION}
  with (copy_data=false, create_slot=true, slot_name='${FORWARD_SLOT}', enabled=true, disable_on_error=true);
SQL
  psql "$OREGON_DB_URL" -X -v ON_ERROR_STOP=1 -f "$TMP/create-forward-subscription.sql" >/dev/null

  for _ in $(seq 1 90); do
    query_ref "$OREGON_REF" \
      "select (select count(*) from pg_subscription where subname='${FORWARD_SUBSCRIPTION}' and subenabled) enabled_subscriptions,(select count(*) from pg_stat_subscription where subname='${FORWARD_SUBSCRIPTION}' and pid is not null) workers,(select count(*) from pg_subscription_rel sr join pg_subscription s on s.oid=sr.srsubid where s.subname='${FORWARD_SUBSCRIPTION}') relations,(select count(*) from pg_subscription_rel sr join pg_subscription s on s.oid=sr.srsubid where s.subname='${FORWARD_SUBSCRIPTION}' and sr.srsubstate='r') ready_relations;" \
      "$TMP/forward-ready.json"
    if jq -e --argjson expected "$expected" 'length==1 and .[0].enabled_subscriptions==1 and .[0].workers>=1 and .[0].relations==$expected and .[0].ready_relations==$expected' "$TMP/forward-ready.json" >/dev/null; then
      ready=true
      break
    fi
    sleep 2
  done
  test "$ready" = true || {
    echo 'Forward Virginia -> Oregon subscription did not become fully ready.' >&2
    cat "$TMP/forward-ready.json" >&2
    exit 1
  }

  query_ref "$VIRGINIA_REF" \
    "select count(*) active_slots from pg_replication_slots where slot_name='${FORWARD_SLOT}' and active;" \
    "$TMP/forward-slot-ready.json"
  test "$(jq -r '.[0].active_slots' "$TMP/forward-slot-ready.json")" = '1' || {
    echo 'Forward replication slot is not active.' >&2
    exit 1
  }
}

post_detach_recovery() {
  require_post_detach_inputs
  verify_post_detach_checkpoint
  resolve_project_keys
  neutralize_reverse_subscriber_role
  rebuild_forward_lane_only
  switch_runtime_vercel_to_virginia
  restore_forward_dr

  {
    echo '### Oregon DR post-detach recovery'
    echo ''
    echo '- Guarded post-detach checkpoint: verified.'
    echo '- Obsolete reverse subscriber role: neutralized.'
    echo '- Virginia -> Oregon forward replication: rebuilt and ready.'
    echo '- Virginia: restored as writable production primary.'
    echo '- Oregon: restored as passive cross-region standby.'
    echo '- Final production readiness is enforced by the shared failback restore gates.'
  } >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
}

post_detach_recovery
