#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-742020474738}"
STACK_NAME="${STACK_NAME:-theouthaven-edge-runtime-production}"
SCHEDULE_GROUP="${SCHEDULE_GROUP:-toh-production-edge-runtime}"
RUNTIME_SECRET_NAME="${RUNTIME_SECRET_NAME:-/theouthaven/production/edge-runtime/env}"
DR_SECRET_NAME="${DR_SECRET_NAME:-/theouthaven/production/dr-reconciler/env}"
VIRGINIA_REF="${VIRGINIA_REF:-ftdsltatyqhtllyyefzp}"
VIRGINIA_URL="${VIRGINIA_URL:-https://ftdsltatyqhtllyyefzp.supabase.co}"
OREGON_REF="${OREGON_REF:-hnhbzynoyrhjndefbwkh}"
OREGON_URL="${OREGON_URL:-https://hnhbzynoyrhjndefbwkh.supabase.co}"
FORWARD_PUBLICATION="theouthaven_dr_publication"
FORWARD_SUBSCRIPTION="theouthaven_va_to_or_dr"
FORWARD_SLOT="theouthaven_va_to_or_dr_slot"
FORWARD_REPLICATION_ROLE="theouthaven_dr_replication"
REVERSE_PUBLICATION="theouthaven_failback_publication"
REVERSE_SUBSCRIPTION="theouthaven_or_to_va_failback"
REVERSE_SLOT="theouthaven_or_to_va_failback_slot"
REVERSE_REPLICATION_ROLE="theouthaven_dr_failback_replication"
REVERSE_SUBSCRIBER_ROLE="theouthaven_dr_failback_subscriber"
VERCEL_PROJECT_ID="${VERCEL_PROJECT_ID:-prj_G4nFS7P3F4cW3PQn4oQAx6Vf3GIN}"
VERCEL_PROJECT_NAME="${VERCEL_PROJECT_NAME:-roseout}"
VERCEL_TEAM_ID="${VERCEL_TEAM_ID:-team_TzlwC4vdLZiT8kFGuXSoj1em}"
BASE_MANIFEST="infra/aws/edge-runtime/schedules.json"
DR_MANIFEST="infra/aws/edge-runtime/dr-schedules.json"
TMP="${RUNNER_TEMP:-/tmp}/oregon-dr-pre-forward-recovery"
mkdir -p "$TMP"
chmod 700 "$TMP"

cleanup() {
  rm -f "$TMP"/*.json "$TMP"/*.sql "$TMP"/*-password "$TMP"/*-key 2>/dev/null || true
}
trap cleanup EXIT

require_tools() {
  command -v aws >/dev/null
  command -v curl >/dev/null
  command -v jq >/dev/null
  command -v openssl >/dev/null
  command -v psql >/dev/null
}

query_ref() {
  local ref="$1" sql="$2" out="$3" code
  jq -n --arg query "$sql" '{query:$query}' > "$TMP/query.json"
  code="$(curl --silent --show-error --output "$out" --write-out '%{http_code}' --request POST \
    --header "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    --header 'Content-Type: application/json' \
    --data-binary "@$TMP/query.json" \
    "https://api.supabase.com/v1/projects/${ref}/database/query")"
  if [[ "$code" != 2* ]]; then
    echo "Supabase management query failed for project $ref (HTTP $code)." >&2
    jq -r 'if type=="object" then (.message // .error // tostring) else tostring end' "$out" 2>/dev/null | head -c 1200 >&2 || true
    echo >&2
    exit 1
  fi
  jq -e 'type=="array"' "$out" >/dev/null
}

resolve_key() {
  local ref="$1" name="$2" out="$3" value
  curl --fail --silent --show-error \
    --header "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    "https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true" > "$TMP/keys.json"
  value="$(jq -r --arg name "$name" '[.[]|select(.type=="legacy" and .name==$name and (.disabled!=true))][0].api_key // empty' "$TMP/keys.json")"
  test -n "$value" || { echo "Missing active $name key for $ref" >&2; exit 1; }
  echo "::add-mask::$value"
  printf '%s' "$value" > "$out"
  chmod 600 "$out"
}

cf_output() {
  local key="$1"
  aws cloudformation describe-stacks --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='${key}'].OutputValue" --output text
}

schedule_state() {
  aws scheduler get-schedule --group-name "$SCHEDULE_GROUP" --name "$1" --query State --output text
}

verify_manifest_state() {
  local manifest="$1" expected="$2" count=0 name
  while IFS= read -r name; do
    test "$(schedule_state "$name")" = "$expected" || {
      echo "Schedule $name expected $expected" >&2
      exit 1
    }
    count=$((count+1))
  done < <(jq -r '.[].name' "$manifest")
  printf '%s' "$count"
}

set_manifest_state() {
  local manifest="$1" state="$2" item name expression input target
  local invoker_arn scheduler_role
  invoker_arn="$(cf_output SchedulerInvokerFunctionArn)"
  scheduler_role="$(cf_output EventBridgeSchedulerRoleArn)"
  while IFS= read -r item; do
    name="$(jq -r '.name' <<<"$item")"
    expression="$(jq -r '.expression' <<<"$item")"
    input="$(jq -c '{function:.function,body:.body}' <<<"$item")"
    target="$(jq -nc --arg arn "$invoker_arn" --arg role "$scheduler_role" --arg input "$input" '{Arn:$arn,RoleArn:$role,Input:$input,RetryPolicy:{MaximumEventAgeInSeconds:3600,MaximumRetryAttempts:2}}')"
    aws scheduler update-schedule --group-name "$SCHEDULE_GROUP" --name "$name" \
      --schedule-expression "$expression" --flexible-time-window '{"Mode":"OFF"}' \
      --state "$state" --target "$target" >/dev/null
    test "$(schedule_state "$name")" = "$state"
  done < <(jq -c '.[]' "$manifest")
}

resolve_vercel_url() {
  local list_file="$1" detail_file="$2" id candidate
  id="$(jq -r '[.envs[]|select(.key=="NEXT_PUBLIC_SUPABASE_URL" and .target==["production"])][0].id // empty' "$list_file")"
  test -n "$id" || return 1
  curl --fail --silent --show-error \
    --header "Authorization: Bearer $VERCEL_TOKEN" \
    "https://api.vercel.com/v1/projects/${VERCEL_PROJECT_ID}/env/${id}?teamId=${VERCEL_TEAM_ID}" > "$detail_file"
  for candidate in \
    "$(jq -r '[.envs[]|select(.key=="NEXT_PUBLIC_SUPABASE_URL" and .target==["production"])][0].value // empty' "$list_file")" \
    "$(jq -r '[.envs[]|select(.key=="NEXT_PUBLIC_SUPABASE_URL" and .target==["production"])][0].legacyValue // empty' "$list_file")" \
    "$(jq -r '[.envs[]|select(.key=="NEXT_PUBLIC_SUPABASE_URL" and .target==["production"])][0].vsmValue // empty' "$list_file")" \
    "$(jq -r '.value // empty' "$detail_file")" \
    "$(jq -r '.legacyValue // empty' "$detail_file")" \
    "$(jq -r '.vsmValue // empty' "$detail_file")"; do
    case "$candidate" in https://*.supabase.co) printf '%s' "$candidate"; return 0;; esac
  done
  return 1
}

candidate_sql() {
  cat <<'SQL'
with c as (
  select n.nspname||'.'||x.relname rel
  from pg_class x join pg_namespace n on n.oid=x.relnamespace
  where x.relkind in ('r','p') and n.nspname='public'
    and x.relname not in ('toh_region_migration_apply_errors','toh_storage_migration_manifest')
)
select count(*) candidate_tables,
       md5(coalesce(string_agg(rel,',' order by rel),'')) candidate_fp
from c;
SQL
}

public_data_sql() {
  cat <<'SQL'
with rels as (
  select c.relname table_name,q.row_count,q.row_fingerprint
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  cross join lateral (
    select (xpath('/row/c/text()',x))[1]::text::bigint row_count,
           (xpath('/row/h/text()',x))[1]::text row_fingerprint
    from (
      select query_to_xml(
        format('select count(*) as c, coalesce(sum(hashtextextended(to_jsonb(t)::text,0)::numeric),0) as h from %I.%I t',n.nspname,c.relname),
        false,true,''
      ) x
    ) s
  ) q
  where c.relkind='r' and n.nspname='public'
    and c.relname not in ('toh_region_migration_apply_errors','toh_storage_migration_manifest')
)
select count(*) table_count,sum(row_count) total_rows,
       md5(string_agg(table_name||':'||row_count::text||':'||row_fingerprint,'|' order by table_name)) data_fingerprint
from rels;
SQL
}

bump_edge_epoch() {
  local label="$1" edge_fn
  edge_fn="$(cf_output EdgeRuntimeFunctionName)"
  aws lambda get-function-configuration --function-name "$edge_fn" --query Environment.Variables --output json > "$TMP/edge-env.json"
  jq -n --slurpfile vars "$TMP/edge-env.json" --arg epoch "${label}-$(date +%s)" '{Variables:($vars[0]+{DR_PRIMARY_EPOCH:$epoch})}' > "$TMP/edge-env-update.json"
  aws lambda update-function-configuration --function-name "$edge_fn" --environment "file://$TMP/edge-env-update.json" >/dev/null
  aws lambda wait function-updated --function-name "$edge_fn"
}

unfence_roles() {
  local ref="$1" out="$2"
  query_ref "$ref" \
    "alter database postgres reset default_transaction_read_only; alter role postgres reset default_transaction_read_only; select pg_terminate_backend(pid) from pg_stat_activity where pid<>pg_backend_pid() and usename in ('authenticator','supabase_auth_admin','supabase_storage_admin');" \
    "$out"
}

invoke_internal() {
  local function="$1" body="$2" out="$3" invoker
  invoker="$(cf_output SchedulerInvokerFunctionName)"
  jq -nc --arg function "$function" --argjson body "$body" '{function:$function,body:$body}' > "$TMP/invoke.json"
  aws lambda invoke --function-name "$invoker" --cli-binary-format raw-in-base64-out \
    --payload "fileb://$TMP/invoke.json" "$out" >/dev/null
  jq -e '.ok==true and .status<400 and .response.success==true' "$out" >/dev/null
}

prove_initial_boundary() {
  local catalog_sql data_sql seq_sql expected
  test "$(aws sts get-caller-identity --query Account --output text)" = "$AWS_ACCOUNT_ID"
  test -n "${SUPABASE_ACCESS_TOKEN:-}" || { echo 'Missing SUPABASE_ACCESS_TOKEN.' >&2; exit 1; }
  test -n "${VERCEL_TOKEN:-}" || { echo 'Missing VERCEL_TOKEN.' >&2; exit 1; }
  test -n "${OREGON_DB_URL:-}" || { echo 'Missing OREGON_DB_URL.' >&2; exit 1; }
  case "$OREGON_DB_URL" in *"$OREGON_REF"*) ;; *) echo 'OREGON_DB_URL is not scoped to Oregon DR.' >&2; exit 1;; esac

  test "$(jq 'length' "$BASE_MANIFEST")" = '65'
  test "$(jq 'length' "$DR_MANIFEST")" = '2'
  test "$(verify_manifest_state "$BASE_MANIFEST" DISABLED)" = '65'
  test "$(verify_manifest_state "$DR_MANIFEST" DISABLED)" = '2'

  aws secretsmanager get-secret-value --secret-id "$DR_SECRET_NAME" --query SecretString --output text > "$TMP/dr-start.json"
  aws secretsmanager get-secret-value --secret-id "$RUNTIME_SECRET_NAME" --query SecretString --output text > "$TMP/runtime-start.json"
  jq -e '.DR_MODE=="failback_in_progress"' "$TMP/dr-start.json" >/dev/null || { echo 'Recovery requires DR_MODE=failback_in_progress.' >&2; exit 1; }
  test "$(jq -r '.SUPABASE_URL // empty' "$TMP/runtime-start.json")" = "$OREGON_URL" || { echo 'Recovery requires AWS runtime still targeting Oregon.' >&2; exit 1; }

  curl --fail --silent --show-error --header "Authorization: Bearer $VERCEL_TOKEN" \
    "https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env?teamId=${VERCEL_TEAM_ID}&decrypt=true" > "$TMP/vercel-start.json"
  test "$(resolve_vercel_url "$TMP/vercel-start.json" "$TMP/vercel-start-detail.json" || true)" = "$OREGON_URL" || { echo 'Recovery requires Vercel production still targeting Oregon.' >&2; exit 1; }

  query_ref "$VIRGINIA_REF" \
    "select (select count(*) from cron.job) cron_jobs,(select count(*) from pg_db_role_setting s join pg_database d on d.oid=s.setdatabase where d.datname='postgres' and s.setrole=0 and coalesce(array_to_string(s.setconfig,','),'') like '%default_transaction_read_only=on%') fence,(select count(*) from pg_roles where rolname='postgres' and coalesce(array_to_string(rolconfig,','),'') like '%default_transaction_read_only=off%') admin_override,(select count(*) from pg_subscription where subname='${REVERSE_SUBSCRIPTION}') reverse_subscriptions,(select count(*) from pg_publication where pubname='${FORWARD_PUBLICATION}') forward_publications,(select count(*) from pg_replication_slots where slot_name='${FORWARD_SLOT}') forward_slots,(select count(*) from pg_roles where rolname='${REVERSE_SUBSCRIBER_ROLE}') reverse_subscriber_roles,(select count(*) from pg_roles where rolname='${FORWARD_REPLICATION_ROLE}') forward_replication_roles,(select count(*) from pg_roles where rolname='authenticator' and coalesce(array_to_string(rolconfig,','),'') like '%pgrst.db_pre_request=public.theouthaven_dr_pre_request%') dr_pre_request_configured;" \
    "$TMP/va-boundary.json"
  query_ref "$OREGON_REF" \
    "select (select count(*) from cron.job where active) active_cron_jobs,(select count(*) from pg_db_role_setting s join pg_database d on d.oid=s.setdatabase where d.datname='postgres' and s.setrole=0 and coalesce(array_to_string(s.setconfig,','),'') like '%default_transaction_read_only=on%') fence,(select count(*) from pg_roles where rolname='postgres' and coalesce(array_to_string(rolconfig,','),'') like '%default_transaction_read_only=off%') admin_override,(select count(*) from pg_subscription where subname='${FORWARD_SUBSCRIPTION}') forward_subscriptions,(select count(*) from pg_publication where pubname='${REVERSE_PUBLICATION}') reverse_publications,(select count(*) from pg_replication_slots where slot_name='${REVERSE_SLOT}') reverse_slots,(select count(*) from pg_roles where rolname='${REVERSE_REPLICATION_ROLE}') reverse_replication_roles,(select count(*) from pg_roles where rolname='authenticator' and coalesce(array_to_string(rolconfig,','),'') like '%pgrst.db_pre_request=public.theouthaven_dr_pre_request%') dr_pre_request_configured;" \
    "$TMP/or-boundary.json"
  jq -e '.[0].cron_jobs==0 and .[0].fence==1 and .[0].admin_override==1 and .[0].reverse_subscriptions==0 and .[0].forward_publications==1 and .[0].forward_slots==0 and .[0].reverse_subscriber_roles<=1 and .[0].forward_replication_roles<=1 and .[0].dr_pre_request_configured==1' "$TMP/va-boundary.json" >/dev/null || { echo 'Virginia does not match the exact pre-forward-rebuild boundary.' >&2; exit 1; }
  jq -e '.[0].active_cron_jobs==0 and .[0].fence==1 and .[0].admin_override==1 and .[0].forward_subscriptions==0 and .[0].reverse_publications==1 and .[0].reverse_slots==0 and .[0].reverse_replication_roles<=1 and .[0].dr_pre_request_configured==1' "$TMP/or-boundary.json" >/dev/null || { echo 'Oregon does not match the exact pre-forward-rebuild boundary.' >&2; exit 1; }

  query_ref "$VIRGINIA_REF" "$(candidate_sql)" "$TMP/va-candidate.json"
  query_ref "$OREGON_REF" "$(candidate_sql)" "$TMP/or-candidate.json"
  cmp -s <(jq -S '.[0]' "$TMP/va-candidate.json") <(jq -S '.[0]' "$TMP/or-candidate.json") || { echo 'Public table inventory differs across regions.' >&2; exit 1; }
  expected="$(jq -r '.[0].candidate_tables' "$TMP/va-candidate.json")"
  test "$expected" -gt 0
  printf '%s' "$expected" > "$TMP/expected-tables"

  query_ref "$VIRGINIA_REF" \
    "with c as (select n.nspname||'.'||x.relname rel from pg_class x join pg_namespace n on n.oid=x.relnamespace where x.relkind in ('r','p') and n.nspname='public' and x.relname not in ('toh_region_migration_apply_errors','toh_storage_migration_manifest')),p as (select schemaname||'.'||tablename rel from pg_publication_tables where pubname='${FORWARD_PUBLICATION}') select (select count(*) from c) candidate_tables,(select count(*) from p) published_tables,(select md5(coalesce(string_agg(rel,',' order by rel),'')) from c) candidate_fp,(select md5(coalesce(string_agg(rel,',' order by rel),'')) from p) published_fp;" \
    "$TMP/forward-publication.json"
  jq -e '.[0].candidate_tables==.[0].published_tables and .[0].candidate_fp==.[0].published_fp' "$TMP/forward-publication.json" >/dev/null || { echo 'Virginia forward publication does not exactly cover the eligible public table set.' >&2; exit 1; }

  catalog_sql="$(cat scripts/dr/writable-catalog.sql)"
  query_ref "$VIRGINIA_REF" "$catalog_sql" "$TMP/va-catalog.json"
  query_ref "$OREGON_REF" "$catalog_sql" "$TMP/or-catalog.json"
  cmp -s <(jq -S 'sort_by(.kind,.object_name,.item_name)' "$TMP/va-catalog.json") <(jq -S 'sort_by(.kind,.object_name,.item_name)' "$TMP/or-catalog.json") || { echo 'Writable schema catalogs differ.' >&2; exit 1; }

  data_sql="$(public_data_sql)"
  query_ref "$VIRGINIA_REF" "$data_sql" "$TMP/va-data.json"
  query_ref "$OREGON_REF" "$data_sql" "$TMP/or-data.json"
  cmp -s <(jq -S '.[0]' "$TMP/va-data.json") <(jq -S '.[0]' "$TMP/or-data.json") || { echo 'Exact public data parity is not proven.' >&2; exit 1; }

  seq_sql="$(cat scripts/dr/promotion-sequence-state.sql)"
  query_ref "$OREGON_REF" "$seq_sql" "$TMP/or-sequences.json"
  query_ref "$VIRGINIA_REF" "$seq_sql" "$TMP/va-sequences.json"
  jq -n --slurpfile source "$TMP/or-sequences.json" --slurpfile target "$TMP/va-sequences.json" '
    ($target[0] | map({key:(.sequence_schema+"."+.sequence_name),value:.}) | from_entries) as $t |
    all($source[0][]; . as $s | $t[$s.sequence_schema+"."+$s.sequence_name] as $v |
      ($v != null) and
      (($v.sequence_last_value|tonumber) >= ([($s.sequence_last_value//0),($s.table_max_value//0),($v.sequence_last_value//0),($v.table_max_value//0),($s.start_value//1)]|map(tonumber)|max)) and
      ($v.sequence_is_called==true))' | grep -qx true || { echo 'Virginia sequence state is not safe for failback completion.' >&2; exit 1; }

  invoke_internal dr-failback-reconciler '{"operation":"status","dryRun":true}' "$TMP/reverse-status.json"
  jq -e '.response.auth.parity==true and .response.storage.parity==true and .response.storage.copyOrReplace==0 and .response.storage.targetOnly==0 and .response.storage.pendingDeletes==0' "$TMP/reverse-status.json" >/dev/null || { echo 'Reverse Auth/Storage parity is not exact at the recovery boundary.' >&2; exit 1; }
  echo "recovery_boundary=pre_forward_rebuild expected_tables=$expected"
}

cleanup_reverse_artifacts() {
  local roles
  echo 'reverse_cleanup_stage=publication'
  query_ref "$OREGON_REF" "drop publication if exists ${REVERSE_PUBLICATION};" "$TMP/reverse-publication-drop.json"
  query_ref "$OREGON_REF" "select count(*) roles from pg_roles where rolname='${REVERSE_REPLICATION_ROLE}';" "$TMP/reverse-source-role-state.json"
  roles="$(jq -r '.[0].roles' "$TMP/reverse-source-role-state.json")"
  test "$roles" = '0' -o "$roles" = '1'
  if [ "$roles" = '1' ]; then
    echo 'reverse_cleanup_stage=source_owned'
    query_ref "$OREGON_REF" "drop owned by ${REVERSE_REPLICATION_ROLE};" "$TMP/reverse-source-owned-drop.json"
    echo 'reverse_cleanup_stage=source_role'
    query_ref "$OREGON_REF" "drop role ${REVERSE_REPLICATION_ROLE};" "$TMP/reverse-source-role-drop.json"
  fi

  query_ref "$VIRGINIA_REF" "select count(*) roles from pg_roles where rolname='${REVERSE_SUBSCRIBER_ROLE}';" "$TMP/reverse-target-role-state.json"
  roles="$(jq -r '.[0].roles' "$TMP/reverse-target-role-state.json")"
  test "$roles" = '0' -o "$roles" = '1'
  if [ "$roles" = '1' ]; then
    echo 'reverse_cleanup_stage=target_owned'
    query_ref "$VIRGINIA_REF" "drop owned by ${REVERSE_SUBSCRIBER_ROLE};" "$TMP/reverse-target-owned-drop.json"
    echo 'reverse_cleanup_stage=target_role'
    query_ref "$VIRGINIA_REF" "drop role ${REVERSE_SUBSCRIBER_ROLE};" "$TMP/reverse-target-role-drop.json"
  fi

  query_ref "$OREGON_REF" "select (select count(*) from pg_publication where pubname='${REVERSE_PUBLICATION}') publications,(select count(*) from pg_replication_slots where slot_name='${REVERSE_SLOT}') slots,(select count(*) from pg_roles where rolname='${REVERSE_REPLICATION_ROLE}') roles;" "$TMP/reverse-source-clean.json"
  query_ref "$VIRGINIA_REF" "select (select count(*) from pg_subscription where subname='${REVERSE_SUBSCRIPTION}') subscriptions,(select count(*) from pg_roles where rolname='${REVERSE_SUBSCRIBER_ROLE}') roles;" "$TMP/reverse-target-clean.json"
  jq -e '.[0].publications==0 and .[0].slots==0 and .[0].roles==0' "$TMP/reverse-source-clean.json" >/dev/null
  jq -e '.[0].subscriptions==0 and .[0].roles==0' "$TMP/reverse-target-clean.json" >/dev/null
  echo 'reverse_cleanup=complete'
}

rebuild_forward_lane() {
  local password expected ready=false zero=false sql
  expected="$(cat "$TMP/expected-tables")"
  query_ref "$OREGON_REF" "select count(*) subscriptions from pg_subscription where subname='${FORWARD_SUBSCRIPTION}';" "$TMP/forward-sub-before.json"
  test "$(jq -r '.[0].subscriptions' "$TMP/forward-sub-before.json")" = '0'
  query_ref "$VIRGINIA_REF" "select count(*) slots from pg_replication_slots where slot_name='${FORWARD_SLOT}';" "$TMP/forward-slot-before.json"
  test "$(jq -r '.[0].slots' "$TMP/forward-slot-before.json")" = '0'

  password="$(openssl rand -hex 32)"
  echo "::add-mask::$password"
  printf '%s' "$password" > "$TMP/forward-password"
  chmod 600 "$TMP/forward-password"
  cat > "$TMP/forward-source.sql" <<SQL
  do \$dr\$
  begin
    if exists(select 1 from pg_roles where rolname='${FORWARD_REPLICATION_ROLE}') then
      execute format('alter role %I with login replication bypassrls password %L','${FORWARD_REPLICATION_ROLE}','${password}');
    else
      execute format('create role %I with login replication bypassrls password %L','${FORWARD_REPLICATION_ROLE}','${password}');
    end if;
    grant connect on database postgres to ${FORWARD_REPLICATION_ROLE};
    grant usage on schema public to ${FORWARD_REPLICATION_ROLE};
    grant select on all tables in schema public to ${FORWARD_REPLICATION_ROLE};
  end
  \$dr\$;
SQL
  query_ref "$VIRGINIA_REF" "$(cat "$TMP/forward-source.sql")" "$TMP/forward-source.json"

  query_ref "$VIRGINIA_REF" \
    "with c as (select n.nspname||'.'||x.relname rel from pg_class x join pg_namespace n on n.oid=x.relnamespace where x.relkind in ('r','p') and n.nspname='public' and x.relname not in ('toh_region_migration_apply_errors','toh_storage_migration_manifest')),p as (select schemaname||'.'||tablename rel from pg_publication_tables where pubname='${FORWARD_PUBLICATION}') select (select count(*) from c) candidate_tables,(select count(*) from p) published_tables,(select md5(coalesce(string_agg(rel,',' order by rel),'')) from c) candidate_fp,(select md5(coalesce(string_agg(rel,',' order by rel),'')) from p) published_fp;" \
    "$TMP/forward-publication-before-sub.json"
  jq -e --argjson expected "$expected" '.[0].candidate_tables==$expected and .[0].published_tables==$expected and .[0].candidate_fp==.[0].published_fp' "$TMP/forward-publication-before-sub.json" >/dev/null

  cat > "$TMP/create-forward-subscription.sql" <<SQL
create subscription ${FORWARD_SUBSCRIPTION}
connection 'host=db.${VIRGINIA_REF}.supabase.co port=5432 dbname=postgres user=${FORWARD_REPLICATION_ROLE} password=${password} sslmode=require application_name=${FORWARD_SUBSCRIPTION}'
publication ${FORWARD_PUBLICATION}
with (copy_data=false, create_slot=true, slot_name='${FORWARD_SLOT}', enabled=true, disable_on_error=true);
SQL
  psql "$OREGON_DB_URL" -X -v ON_ERROR_STOP=1 -f "$TMP/create-forward-subscription.sql" >/dev/null

  for _ in $(seq 1 180); do
    sql="select (select count(*) from pg_subscription where subname='${FORWARD_SUBSCRIPTION}' and subenabled) enabled,(select count(*) from pg_stat_subscription where subname='${FORWARD_SUBSCRIPTION}' and pid is not null) workers,(select count(*) from pg_subscription_rel sr join pg_subscription s on s.oid=sr.srsubid where s.subname='${FORWARD_SUBSCRIPTION}') total,(select count(*) from pg_subscription_rel sr join pg_subscription s on s.oid=sr.srsubid where s.subname='${FORWARD_SUBSCRIPTION}' and sr.srsubstate='r') ready;"
    query_ref "$OREGON_REF" "$sql" "$TMP/forward-ready.json"
    if jq -e --argjson expected "$expected" '.[0].enabled==1 and .[0].workers==1 and .[0].total==$expected and .[0].ready==$expected' "$TMP/forward-ready.json" >/dev/null; then ready=true; break; fi
    sleep 2
  done
  test "$ready" = true || { echo 'Rebuilt Virginia to Oregon standby lane did not become fully ready.' >&2; exit 1; }

  for _ in $(seq 1 90); do
    query_ref "$VIRGINIA_REF" \
      "select (select count(*) from pg_replication_slots where slot_name='${FORWARD_SLOT}') slots,(select count(*) from pg_replication_slots where slot_name='${FORWARD_SLOT}' and active) active_slots,coalesce((select pg_wal_lsn_diff(pg_current_wal_lsn(),confirmed_flush_lsn)::bigint from pg_replication_slots where slot_name='${FORWARD_SLOT}'),-1) lag;" \
      "$TMP/forward-slot.json"
    if jq -e '.[0].slots==1 and .[0].active_slots==1 and .[0].lag==0' "$TMP/forward-slot.json" >/dev/null; then zero=true; break; fi
    sleep 2
  done
  test "$zero" = true || { echo 'Rebuilt forward slot did not become active at zero lag.' >&2; exit 1; }

  query_ref "$VIRGINIA_REF" "$(public_data_sql)" "$TMP/va-data-after-forward.json"
  query_ref "$OREGON_REF" "$(public_data_sql)" "$TMP/or-data-after-forward.json"
  cmp -s <(jq -S '.[0]' "$TMP/va-data-after-forward.json") <(jq -S '.[0]' "$TMP/or-data-after-forward.json") || { echo 'Public parity changed while both projects were fenced.' >&2; exit 1; }
  echo "forward_lane=ready expected_tables=$expected"
}

stage_virginia_control_plane() {
  local va_anon va_service or_anon
  resolve_key "$VIRGINIA_REF" anon "$TMP/va-anon-key"
  resolve_key "$VIRGINIA_REF" service_role "$TMP/va-service-key"
  resolve_key "$OREGON_REF" anon "$TMP/or-anon-key"
  va_anon="$(cat "$TMP/va-anon-key")"
  va_service="$(cat "$TMP/va-service-key")"
  or_anon="$(cat "$TMP/or-anon-key")"

  jq --arg url "$VIRGINIA_URL" --arg anon "$va_anon" --arg service "$va_service" \
    '. + {SUPABASE_URL:$url,UPSTREAM_SUPABASE_URL:$url,NEXT_PUBLIC_SUPABASE_URL:$url,SUPABASE_SERVICE_ROLE_KEY:$service,SUPABASE_ANON_KEY:$anon,NEXT_PUBLIC_SUPABASE_ANON_KEY:$anon}' \
    "$TMP/runtime-start.json" > "$TMP/runtime-va.json"
  aws secretsmanager put-secret-value --secret-id "$RUNTIME_SECRET_NAME" --secret-string "file://$TMP/runtime-va.json" >/dev/null

  jq --arg va "$va_anon" --arg oa "$or_anon" '. + {DR_MODE:"virginia_primary",DR_VIRGINIA_ANON_KEY:$va,DR_OREGON_ANON_KEY:$oa}' \
    "$TMP/dr-start.json" > "$TMP/dr-va.json"
  aws secretsmanager put-secret-value --secret-id "$DR_SECRET_NAME" --secret-string "file://$TMP/dr-va.json" >/dev/null
  bump_edge_epoch virginia-primary-recovery

  aws secretsmanager get-secret-value --secret-id "$RUNTIME_SECRET_NAME" --query SecretString --output text > "$TMP/runtime-check.json"
  aws secretsmanager get-secret-value --secret-id "$DR_SECRET_NAME" --query SecretString --output text > "$TMP/dr-check.json"
  test "$(jq -r '.SUPABASE_URL // empty' "$TMP/runtime-check.json")" = "$VIRGINIA_URL"
  jq -e '.DR_MODE=="virginia_primary"' "$TMP/dr-check.json" >/dev/null
  echo 'aws_control_plane=virginia_staged'
}

cutover_vercel_to_virginia() {
  local va_anon va_service code old_id new_id state ready=false
  va_anon="$(cat "$TMP/va-anon-key")"
  va_service="$(cat "$TMP/va-service-key")"
  curl --fail --silent --show-error --header "Authorization: Bearer $VERCEL_TOKEN" \
    "https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env?teamId=${VERCEL_TEAM_ID}&decrypt=true" > "$TMP/vercel-before.json"
  env_type() { jq -r --arg key "$1" '[.envs[]|select(.key==$key and .target==["production"])][0].type // "encrypted"' "$TMP/vercel-before.json"; }
  for key in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY; do
    test "$(jq --arg key "$key" '[.envs[]|select(.key==$key and .target==["production"])]|length' "$TMP/vercel-before.json")" = '1' || { echo "Expected exactly one production Vercel env for $key." >&2; exit 1; }
  done
  jq -n --arg url "$VIRGINIA_URL" --arg anon "$va_anon" --arg service "$va_service" \
    --arg url_type "$(env_type NEXT_PUBLIC_SUPABASE_URL)" --arg anon_type "$(env_type NEXT_PUBLIC_SUPABASE_ANON_KEY)" --arg service_type "$(env_type SUPABASE_SERVICE_ROLE_KEY)" \
    '[{key:"NEXT_PUBLIC_SUPABASE_URL",value:$url,type:$url_type,target:["production"]},{key:"NEXT_PUBLIC_SUPABASE_ANON_KEY",value:$anon,type:$anon_type,target:["production"]},{key:"SUPABASE_SERVICE_ROLE_KEY",value:$service,type:$service_type,target:["production"]}]' > "$TMP/vercel-upsert.json"
  if [ "$(jq '[.envs[]|select(.key=="SUPABASE_URL" and .target==["production"])]|length' "$TMP/vercel-before.json")" = '1' ]; then
    jq --arg url "$VIRGINIA_URL" --arg type "$(env_type SUPABASE_URL)" '. + [{key:"SUPABASE_URL",value:$url,type:$type,target:["production"]}]' "$TMP/vercel-upsert.json" > "$TMP/vercel-upsert2.json"
    mv "$TMP/vercel-upsert2.json" "$TMP/vercel-upsert.json"
  fi
  code="$(curl --silent --show-error --output "$TMP/vercel-upsert-response.json" --write-out '%{http_code}' --request POST \
    --header "Authorization: Bearer $VERCEL_TOKEN" --header 'Content-Type: application/json' \
    --data-binary "@$TMP/vercel-upsert.json" \
    "https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env?upsert=true&teamId=${VERCEL_TEAM_ID}")"
  if [[ "$code" != 2* ]]; then
    echo "Vercel environment cutover failed (HTTP $code)." >&2
    jq -r '{code:(.error.code//"unknown"),message:(.error.message//"Vercel env upsert failed")}' "$TMP/vercel-upsert-response.json" >&2 || true
    exit 1
  fi

  curl --fail --silent --show-error --header "Authorization: Bearer $VERCEL_TOKEN" \
    "https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env?teamId=${VERCEL_TEAM_ID}&decrypt=true" > "$TMP/vercel-after-env.json"
  test "$(resolve_vercel_url "$TMP/vercel-after-env.json" "$TMP/vercel-after-env-detail.json" || true)" = "$VIRGINIA_URL" || { echo 'Vercel environment did not resolve to Virginia after upsert.' >&2; exit 1; }

  curl --fail --silent --show-error --header "Authorization: Bearer $VERCEL_TOKEN" \
    "https://api.vercel.com/v7/deployments?projectId=${VERCEL_PROJECT_ID}&target=production&limit=1&teamId=${VERCEL_TEAM_ID}" > "$TMP/current-deployment.json"
  old_id="$(jq -r '.deployments[0].uid // .deployments[0].id // empty' "$TMP/current-deployment.json")"
  test -n "$old_id"
  jq -n --arg name "$VERCEL_PROJECT_NAME" --arg project "$VERCEL_PROJECT_ID" --arg deploymentId "$old_id" '{name:$name,project:$project,deploymentId:$deploymentId,target:"production"}' > "$TMP/redeploy.json"
  curl --fail --silent --show-error --request POST \
    --header "Authorization: Bearer $VERCEL_TOKEN" --header 'Content-Type: application/json' \
    --data-binary "@$TMP/redeploy.json" \
    "https://api.vercel.com/v13/deployments?forceNew=1&teamId=${VERCEL_TEAM_ID}" > "$TMP/new-deployment.json"
  new_id="$(jq -r '.id // .uid // empty' "$TMP/new-deployment.json")"
  test -n "$new_id"
  for _ in $(seq 1 120); do
    curl --fail --silent --show-error --header "Authorization: Bearer $VERCEL_TOKEN" \
      "https://api.vercel.com/v13/deployments/${new_id}?teamId=${VERCEL_TEAM_ID}" > "$TMP/deployment-status.json"
    state="$(jq -r '.readyState // .state // empty' "$TMP/deployment-status.json")"
    if [ "$state" = 'READY' ]; then ready=true; break; fi
    if [ "$state" = 'ERROR' ] || [ "$state" = 'CANCELED' ]; then echo "Vercel recovery deployment entered $state" >&2; exit 1; fi
    sleep 5
  done
  test "$ready" = true || { echo 'Virginia Vercel production deployment did not become READY.' >&2; exit 1; }

  # Both databases remained fenced until Vercel's replacement Virginia deployment was ready.
  unfence_roles "$VIRGINIA_REF" "$TMP/va-unfence.json"
  query_ref "$VIRGINIA_REF" "select (select count(*) from pg_db_role_setting s join pg_database d on d.oid=s.setdatabase where d.datname='postgres' and s.setrole=0 and coalesce(array_to_string(s.setconfig,','),'') like '%default_transaction_read_only=on%') fence;" "$TMP/va-unfence-check.json"
  jq -e '.[0].fence==0' "$TMP/va-unfence-check.json" >/dev/null
  echo 'vercel_cutover=virginia_ready_and_writable'
}

restore_standby_and_schedules() {
  local expected status api va_anon
  expected="$(cat "$TMP/expected-tables")"
  # No application/runtime target points to Oregon now. Remove its role fence only so
  # logical replication plus normal Auth/Storage reconciliation can maintain standby parity.
  unfence_roles "$OREGON_REF" "$TMP/or-unfence.json"

  invoke_internal dr-standby-reconciler '{"operation":"status","dryRun":true}' "$TMP/standby-status.json"
  jq -e --argjson expected "$expected" '.response.guard.sourceCronJobs==0 and .response.guard.sourceActiveSlots==1 and .response.guard.targetActiveCronJobs==0 and .response.guard.targetReadyTables==$expected and .response.guard.targetConnectedWorkers>=1 and .response.auth.parity==true and .response.storage.parity==true' "$TMP/standby-status.json" >/dev/null || { echo 'Forward standby health is not exact after Virginia cutover.' >&2; exit 1; }

  set_manifest_state "$BASE_MANIFEST" ENABLED
  set_manifest_state "$DR_MANIFEST" ENABLED
  test "$(verify_manifest_state "$BASE_MANIFEST" ENABLED)" = '65'
  test "$(verify_manifest_state "$DR_MANIFEST" ENABLED)" = '2'

  aws secretsmanager get-secret-value --secret-id "$DR_SECRET_NAME" --query SecretString --output text > "$TMP/dr-final.json"
  aws secretsmanager get-secret-value --secret-id "$RUNTIME_SECRET_NAME" --query SecretString --output text > "$TMP/runtime-final.json"
  jq -e '.DR_MODE=="virginia_primary"' "$TMP/dr-final.json" >/dev/null
  test "$(jq -r '.SUPABASE_URL // empty' "$TMP/runtime-final.json")" = "$VIRGINIA_URL"
  curl --fail --silent --show-error --header "Authorization: Bearer $VERCEL_TOKEN" \
    "https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env?teamId=${VERCEL_TEAM_ID}&decrypt=true" > "$TMP/vercel-final.json"
  test "$(resolve_vercel_url "$TMP/vercel-final.json" "$TMP/vercel-final-detail.json" || true)" = "$VIRGINIA_URL"

  query_ref "$VIRGINIA_REF" \
    "select (select count(*) from cron.job) cron_jobs,(select count(*) from pg_db_role_setting s join pg_database d on d.oid=s.setdatabase where d.datname='postgres' and s.setrole=0 and coalesce(array_to_string(s.setconfig,','),'') like '%default_transaction_read_only=on%') fence,(select count(*) from pg_replication_slots where slot_name='${FORWARD_SLOT}' and active) active_forward_slots,(select count(*) from pg_subscription where subname='${REVERSE_SUBSCRIPTION}') reverse_subscriptions,(select count(*) from pg_roles where rolname='${REVERSE_SUBSCRIBER_ROLE}') reverse_roles;" \
    "$TMP/va-final.json"
  query_ref "$OREGON_REF" \
    "select (select count(*) from cron.job where active) active_cron_jobs,(select count(*) from pg_db_role_setting s join pg_database d on d.oid=s.setdatabase where d.datname='postgres' and s.setrole=0 and coalesce(array_to_string(s.setconfig,','),'') like '%default_transaction_read_only=on%') fence,(select count(*) from pg_subscription where subname='${FORWARD_SUBSCRIPTION}' and subenabled) forward_subscriptions,(select count(*) from pg_stat_subscription where subname='${FORWARD_SUBSCRIPTION}' and pid is not null) forward_workers,(select count(*) from pg_subscription_rel sr join pg_subscription s on s.oid=sr.srsubid where s.subname='${FORWARD_SUBSCRIPTION}') forward_total,(select count(*) from pg_subscription_rel sr join pg_subscription s on s.oid=sr.srsubid where s.subname='${FORWARD_SUBSCRIPTION}' and sr.srsubstate='r') forward_ready,(select count(*) from pg_publication where pubname='${REVERSE_PUBLICATION}') reverse_publications,(select count(*) from pg_replication_slots where slot_name='${REVERSE_SLOT}') reverse_slots,(select count(*) from pg_roles where rolname='${REVERSE_REPLICATION_ROLE}') reverse_roles;" \
    "$TMP/or-final.json"
  jq -e '.[0].cron_jobs==0 and .[0].fence==0 and .[0].active_forward_slots==1 and .[0].reverse_subscriptions==0 and .[0].reverse_roles==0' "$TMP/va-final.json" >/dev/null
  jq -e --argjson expected "$expected" '.[0].active_cron_jobs==0 and .[0].fence==0 and .[0].forward_subscriptions==1 and .[0].forward_workers==1 and .[0].forward_total==$expected and .[0].forward_ready==$expected and .[0].reverse_publications==0 and .[0].reverse_slots==0 and .[0].reverse_roles==0' "$TMP/or-final.json" >/dev/null

  status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' https://theouthaven.com/)"
  [[ "$status" == 2* || "$status" == 3* ]] || { echo "Production smoke returned HTTP $status" >&2; exit 1; }
  va_anon="$(cat "$TMP/va-anon-key")"
  api="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --header "apikey: $va_anon" --header "Authorization: Bearer $va_anon" "${VIRGINIA_URL}/rest/v1/locations?select=id&limit=1")"
  test "$api" = '200' || { echo "Virginia Data API smoke returned HTTP $api" >&2; exit 1; }

  echo 'public_data_api=healthy'
  echo 'recovery_result=virginia_primary_restored'
  {
    echo '### DR fail-closed recovery complete'
    echo ''
    echo '- Production primary: `Virginia`.'
    echo '- Oregon: passive standby.'
    echo '- Forward Virginia -> Oregon logical replication: rebuilt, active, and ready.'
    echo '- Reverse failback artifacts: removed.'
    echo '- Auth/Storage standby parity: verified.'
    echo '- Base schedules: 65 enabled.'
    echo '- DR schedules: 2 enabled.'
    echo '- Supabase pg_cron remains inactive by policy.'
  } >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
}

main() {
  require_tools
  prove_initial_boundary
  cleanup_reverse_artifacts
  rebuild_forward_lane
  stage_virginia_control_plane
  cutover_vercel_to_virginia
  restore_standby_and_schedules
}

main "$@"
