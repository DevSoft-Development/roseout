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
VIRGINIA_POOLER_HOST="${VIRGINIA_POOLER_HOST:-aws-0-us-east-1.pooler.supabase.com}"
OREGON_REF="${OREGON_REF:-hnhbzynoyrhjndefbwkh}"
OREGON_URL="${OREGON_URL:-https://hnhbzynoyrhjndefbwkh.supabase.co}"
OREGON_HOST="${OREGON_HOST:-db.hnhbzynoyrhjndefbwkh.supabase.co}"
FORWARD_PUBLICATION="theouthaven_dr_publication"
FORWARD_SUBSCRIPTION="theouthaven_va_to_or_dr"
FORWARD_SLOT="theouthaven_va_to_or_dr_slot"
FORWARD_REPLICATION_ROLE="theouthaven_dr_replication"
FAILBACK_PUBLICATION="theouthaven_failback_publication"
FAILBACK_SUBSCRIPTION="theouthaven_or_to_va_failback"
FAILBACK_SLOT="theouthaven_or_to_va_failback_slot"
FAILBACK_REPLICATION_ROLE="theouthaven_dr_failback_replication"
FAILBACK_SUBSCRIBER_ROLE="theouthaven_dr_failback_subscriber"
VERCEL_PROJECT_ID="${VERCEL_PROJECT_ID:-prj_G4nFS7P3F4cW3PQn4oQAx6Vf3GIN}"
VERCEL_PROJECT_NAME="${VERCEL_PROJECT_NAME:-roseout}"
VERCEL_TEAM_ID="${VERCEL_TEAM_ID:-team_TzlwC4vdLZiT8kFGuXSoj1em}"
BASE_MANIFEST="infra/aws/edge-runtime/schedules.json"
DR_MANIFEST="infra/aws/edge-runtime/dr-schedules.json"
TMP="${RUNNER_TEMP:-/tmp}/oregon-dr-failback"
mkdir -p "$TMP"
chmod 700 "$TMP"

cleanup() {
  rm -f "$TMP"/*.json "$TMP"/*.sql "$TMP"/*-password "$TMP"/*-service "$TMP"/*-anon 2>/dev/null || true
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
  local ref="$1" sql="$2" out="$3"
  jq -n --arg query "$sql" '{query:$query}' > "$TMP/query.json"
  curl --fail --silent --show-error --request POST \
    --header "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    --header 'Content-Type: application/json' \
    --data-binary "@$TMP/query.json" \
    "https://api.supabase.com/v1/projects/${ref}/database/query" > "$out"
  jq -e 'type=="array"' "$out" >/dev/null
}

resolve_vercel_public_url() {
  local list_file="$1" detail_file="$2" id candidate
  id="$(jq -r '[.envs[] | select(.key=="NEXT_PUBLIC_SUPABASE_URL" and .target==["production"])][0].id // empty' "$list_file")"
  test -n "$id" || return 1
  curl --fail --silent --show-error \
    --header "Authorization: Bearer $VERCEL_TOKEN" \
    "https://api.vercel.com/v1/projects/${VERCEL_PROJECT_ID}/env/${id}?teamId=${VERCEL_TEAM_ID}" > "$detail_file"
  for candidate in \
    "$(jq -r '[.envs[] | select(.key=="NEXT_PUBLIC_SUPABASE_URL" and .target==["production"])][0].value // empty' "$list_file")" \
    "$(jq -r '[.envs[] | select(.key=="NEXT_PUBLIC_SUPABASE_URL" and .target==["production"])][0].legacyValue // empty' "$list_file")" \
    "$(jq -r '[.envs[] | select(.key=="NEXT_PUBLIC_SUPABASE_URL" and .target==["production"])][0].vsmValue // empty' "$list_file")" \
    "$(jq -r '.value // empty' "$detail_file")" \
    "$(jq -r '.legacyValue // empty' "$detail_file")" \
    "$(jq -r '.vsmValue // empty' "$detail_file")"; do
    case "$candidate" in
      https://*.supabase.co) printf '%s' "$candidate"; return 0 ;;
    esac
  done
  return 1
}

resolve_key() {
  local ref="$1" name="$2" out="$3" value
  curl --fail --silent --show-error \
    --header "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    "https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true" > "$TMP/keys.json"
  value="$(jq -r --arg name "$name" '[.[] | select(.type=="legacy" and .name==$name and (.disabled != true))][0].api_key // empty' "$TMP/keys.json")"
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
    count=$((count + 1))
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

bump_edge_epoch() {
  local label="$1" edge_fn
  edge_fn="$(cf_output EdgeRuntimeFunctionName)"
  aws lambda get-function-configuration --function-name "$edge_fn" \
    --query Environment.Variables --output json > "$TMP/edge-env.json"
  jq -n --slurpfile vars "$TMP/edge-env.json" --arg epoch "${label}-$(date +%s)" \
    '{Variables:($vars[0]+{DR_PRIMARY_EPOCH:$epoch})}' > "$TMP/edge-env-update.json"
  aws lambda update-function-configuration --function-name "$edge_fn" \
    --environment "file://$TMP/edge-env-update.json" >/dev/null
  aws lambda wait function-updated --function-name "$edge_fn"
}

fence_roles() {
  local ref="$1" out="$2"
  query_ref "$ref" \
    "alter role postgres set default_transaction_read_only=off; alter database postgres set default_transaction_read_only=on; select pg_terminate_backend(pid) from pg_stat_activity where pid<>pg_backend_pid() and usename in ('authenticator','supabase_auth_admin','supabase_storage_admin');" \
    "$out"
  query_ref "$ref" \
    "select (select count(*) from pg_db_role_setting s join pg_database d on d.oid=s.setdatabase where d.datname='postgres' and s.setrole=0 and coalesce(array_to_string(s.setconfig,','),'') like '%default_transaction_read_only=on%') database_fences,(select count(*) from pg_roles where rolname='postgres' and coalesce(array_to_string(rolconfig,','),'') like '%default_transaction_read_only=off%') admin_overrides,(select count(*) from pg_roles where rolname in ('authenticator','supabase_auth_admin','supabase_storage_admin') and coalesce(array_to_string(rolconfig,','),'') like '%default_transaction_read_only=off%') service_write_overrides,(select count(*) from pg_roles where rolname='authenticator' and coalesce(array_to_string(rolconfig,','),'') like '%pgrst.db_pre_request=public.theouthaven_dr_pre_request%') dr_pre_request_configured;" \
    "$TMP/fence-verify.json"
  jq -e '.[0].database_fences==1 and .[0].admin_overrides==1 and .[0].service_write_overrides==0 and .[0].dr_pre_request_configured==1' "$TMP/fence-verify.json" >/dev/null
}

unfence_roles() {
  local ref="$1" out="$2"
  query_ref "$ref" \
    "alter database postgres reset default_transaction_read_only; alter role postgres reset default_transaction_read_only; select pg_terminate_backend(pid) from pg_stat_activity where pid<>pg_backend_pid() and usename in ('authenticator','supabase_auth_admin','supabase_storage_admin');" \
    "$out"
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

verify_oregon_primary_start() {
  local recovery="${1:-false}"
  test "$(aws sts get-caller-identity --query Account --output text)" = "$AWS_ACCOUNT_ID"
  aws secretsmanager get-secret-value --secret-id "$DR_SECRET_NAME" --query SecretString --output text > "$TMP/dr-start.json"
  if [ "$recovery" = 'true' ]; then
    jq -e '.DR_MODE=="failback_in_progress"' "$TMP/dr-start.json" >/dev/null || {
      echo 'Fail-closed recovery requires DR_MODE=failback_in_progress.' >&2
      exit 1
    }
  else
    jq -e '.DR_MODE=="oregon_primary"' "$TMP/dr-start.json" >/dev/null || {
      echo 'Failback is not applicable unless Oregon is the active primary.' >&2
      exit 1
    }
  fi
  aws secretsmanager get-secret-value --secret-id "$RUNTIME_SECRET_NAME" --query SecretString --output text > "$TMP/runtime-start.json"
  test "$(jq -r '.SUPABASE_URL // empty' "$TMP/runtime-start.json")" = "$OREGON_URL" || {
    echo 'AWS Edge Runtime does not target Oregon.' >&2
    exit 1
  }
  if [ "$recovery" = 'true' ]; then
    test "$(verify_manifest_state "$BASE_MANIFEST" DISABLED)" = "$(jq 'length' "$BASE_MANIFEST")"
    test "$(verify_manifest_state "$DR_MANIFEST" DISABLED)" = '2'
  else
    test "$(verify_manifest_state "$BASE_MANIFEST" ENABLED)" = "$(jq 'length' "$BASE_MANIFEST")"
    test "$(verify_manifest_state "$DR_MANIFEST" DISABLED)" = '2'
  fi

  curl --fail --silent --show-error --header "Authorization: Bearer $VERCEL_TOKEN" \
    "https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env?teamId=${VERCEL_TEAM_ID}&decrypt=true" > "$TMP/vercel-env-start.json"
  test "$(jq -r '[.envs[] | select(.key=="NEXT_PUBLIC_SUPABASE_URL" and .target==["production"])][0].type // empty' "$TMP/vercel-env-start.json")" = 'encrypted' || {
    echo 'Vercel production public Supabase URL is not encrypted.' >&2
    exit 1
  }
  test "$(resolve_vercel_public_url "$TMP/vercel-env-start.json" "$TMP/vercel-env-start-detail.json" || true)" = "$OREGON_URL" || {
    echo 'Vercel production does not target Oregon.' >&2
    exit 1
  }

  query_ref "$VIRGINIA_REF" \
    "select (select count(*) from cron.job) cron_jobs,(select count(*) from pg_replication_slots where slot_name='${FORWARD_SLOT}' and active) active_forward_slots,(select count(*) from pg_db_role_setting s join pg_database d on d.oid=s.setdatabase where d.datname='postgres' and s.setrole=0 and coalesce(array_to_string(s.setconfig,','),'') like '%default_transaction_read_only=on%') database_fences,(select count(*) from pg_roles where rolname='authenticator' and coalesce(array_to_string(rolconfig,','),'') like '%pgrst.db_pre_request=public.theouthaven_dr_pre_request%') dr_pre_request_configured;" \
    "$TMP/virginia-start.json"
  query_ref "$OREGON_REF" \
    "select (select count(*) from cron.job where active) active_cron_jobs,(select count(*) from pg_subscription where subname='${FORWARD_SUBSCRIPTION}') forward_subscriptions,(select count(*) from pg_subscription where subname='${FORWARD_SUBSCRIPTION}' and subenabled) enabled_forward_subscriptions,(select count(*) from pg_stat_subscription where subname='${FORWARD_SUBSCRIPTION}' and pid is not null) forward_workers,(select count(*) from pg_db_role_setting s join pg_database d on d.oid=s.setdatabase where d.datname='postgres' and s.setrole=0 and coalesce(array_to_string(s.setconfig,','),'') like '%default_transaction_read_only=on%') database_fences,(select count(*) from pg_roles where rolname='authenticator' and coalesce(array_to_string(rolconfig,','),'') like '%pgrst.db_pre_request=public.theouthaven_dr_pre_request%') dr_pre_request_configured;" \
    "$TMP/oregon-start.json"
  jq -e '.[0].cron_jobs==0 and .[0].active_forward_slots==0 and .[0].database_fences==1 and .[0].dr_pre_request_configured==1' "$TMP/virginia-start.json" >/dev/null
  if [ "$recovery" = 'true' ]; then
    jq -e '.[0].active_cron_jobs==0 and .[0].forward_subscriptions==0 and .[0].enabled_forward_subscriptions==0 and .[0].forward_workers==0 and .[0].database_fences==1 and .[0].dr_pre_request_configured==1' "$TMP/oregon-start.json" >/dev/null || {
      echo 'Fail-closed recovery requires Oregon fenced with the old forward lane detached.' >&2
      exit 1
    }
  else
    jq -e '.[0].active_cron_jobs==0 and .[0].forward_subscriptions==0 and .[0].enabled_forward_subscriptions==0 and .[0].forward_workers==0 and .[0].database_fences==0 and .[0].dr_pre_request_configured==1' "$TMP/oregon-start.json" >/dev/null || {
      echo 'Old Virginia to Oregon logical replication is not fully detached.' >&2
      exit 1
    }
  fi
}

resolve_project_keys() {
  resolve_key "$VIRGINIA_REF" service_role "$TMP/virginia-service"
  resolve_key "$VIRGINIA_REF" anon "$TMP/virginia-anon"
  resolve_key "$OREGON_REF" service_role "$TMP/oregon-service"
  resolve_key "$OREGON_REF" anon "$TMP/oregon-anon"
  rm -f "$TMP/keys.json"
}

verify_prepare_prerequisites() {
  local catalog_sql boundary_sql roles_sql
  catalog_sql="$(cat scripts/dr/writable-catalog.sql)"
  query_ref "$OREGON_REF" "$catalog_sql" "$TMP/oregon-catalog.json"
  query_ref "$VIRGINIA_REF" "$catalog_sql" "$TMP/virginia-catalog.json"
  cmp -s <(jq -S 'sort_by(.kind,.object_name,.item_name)' "$TMP/oregon-catalog.json") \
         <(jq -S 'sort_by(.kind,.object_name,.item_name)' "$TMP/virginia-catalog.json") || {
    echo 'Writable schema drift blocks reverse preparation.' >&2
    exit 1
  }

  boundary_sql="with candidate as (select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname='public' and c.relname not in ('toh_region_migration_apply_errors','toh_storage_migration_manifest')) select count(*) outside_fk_count from pg_constraint con where con.contype='f' and con.confrelid in (select oid from candidate) and con.conrelid not in (select oid from candidate);"
  query_ref "$VIRGINIA_REF" "$boundary_sql" "$TMP/reseed-boundary.json"
  test "$(jq -r '.[0].outside_fk_count' "$TMP/reseed-boundary.json")" = '0' || {
    echo 'Virginia public reseed crosses the DR table boundary.' >&2
    exit 1
  }

  roles_sql="select (select count(*) from pg_db_role_setting s join pg_database d on d.oid=s.setdatabase where d.datname='postgres' and s.setrole=0 and coalesce(array_to_string(s.setconfig,','),'') like '%default_transaction_read_only=on%') database_fences,(select count(*) from pg_roles where rolname='postgres' and coalesce(array_to_string(rolconfig,','),'') like '%default_transaction_read_only=off%') admin_overrides,(select count(*) from pg_roles where rolname in ('authenticator','supabase_auth_admin','supabase_storage_admin') and coalesce(array_to_string(rolconfig,','),'') like '%default_transaction_read_only=off%') service_write_overrides;"
  query_ref "$VIRGINIA_REF" "$roles_sql" "$TMP/virginia-fence.json"
  jq -e '.[0].database_fences==1 and .[0].admin_overrides==1 and .[0].service_write_overrides==0' "$TMP/virginia-fence.json" >/dev/null || {
    echo 'Virginia is not fully fenced from application/Auth/Storage writes.' >&2
    exit 1
  }

}

wait_reverse_ready() {
  local expected ready=false sql
  query_ref "$VIRGINIA_REF" "$(candidate_sql)" "$TMP/candidate.json"
  expected="$(jq -r '.[0].candidate_tables' "$TMP/candidate.json")"
  for _ in $(seq 1 540); do
    sql="select (select count(*) from pg_subscription where subname='${FAILBACK_SUBSCRIPTION}' and subenabled) enabled,(select count(*) from pg_stat_subscription where subname='${FAILBACK_SUBSCRIPTION}' and pid is not null) workers,(select count(*) from pg_subscription_rel sr join pg_subscription s on s.oid=sr.srsubid where s.subname='${FAILBACK_SUBSCRIPTION}') total,(select count(*) from pg_subscription_rel sr join pg_subscription s on s.oid=sr.srsubid where s.subname='${FAILBACK_SUBSCRIPTION}' and sr.srsubstate='r') ready;"
    query_ref "$VIRGINIA_REF" "$sql" "$TMP/reverse-ready.json"
    if jq -e --argjson expected "$expected" '.[0].enabled==1 and .[0].workers==1 and .[0].total==$expected and .[0].ready==$expected' "$TMP/reverse-ready.json" >/dev/null; then
      ready=true
      break
    fi
    sleep 10
  done
  test "$ready" = true || { echo 'Reverse Oregon to Virginia public replication did not become fully ready.' >&2; exit 1; }
  printf '%s' "$expected"
}

prepare_reverse_lane() {
  local sub_count password subscriber_password subscriber_user ready=false
  verify_prepare_prerequisites
  query_ref "$VIRGINIA_REF" "select count(*) subscriptions from pg_subscription where subname='${FAILBACK_SUBSCRIPTION}';" "$TMP/reverse-sub-count.json"
  sub_count="$(jq -r '.[0].subscriptions' "$TMP/reverse-sub-count.json")"
  test "$sub_count" = '0' -o "$sub_count" = '1' || { echo "Unexpected reverse subscription count: $sub_count" >&2; exit 1; }

  if [ "$sub_count" = '0' ]; then
    password="$(openssl rand -hex 32)"
    subscriber_password="$(openssl rand -hex 32)"
    echo "::add-mask::$password"
    echo "::add-mask::$subscriber_password"
    printf '%s' "$password" > "$TMP/failback-replication-password"
    printf '%s' "$subscriber_password" > "$TMP/failback-subscriber-password"
    chmod 600 "$TMP/failback-replication-password" "$TMP/failback-subscriber-password"

    cat > "$TMP/oregon-reverse-source.sql" <<SQL
    do \$dr\$
    declare rels text;
    begin
      if exists (select 1 from pg_roles where rolname='${FAILBACK_REPLICATION_ROLE}') then
        execute format('alter role %I with login replication bypassrls password %L','${FAILBACK_REPLICATION_ROLE}','${password}');
      else
        execute format('create role %I with login replication bypassrls password %L','${FAILBACK_REPLICATION_ROLE}','${password}');
      end if;
      grant connect on database postgres to ${FAILBACK_REPLICATION_ROLE};
      grant usage on schema public to ${FAILBACK_REPLICATION_ROLE};
      grant select on all tables in schema public to ${FAILBACK_REPLICATION_ROLE};
      if not exists(select 1 from pg_publication where pubname='${FAILBACK_PUBLICATION}') then
        select string_agg(format('%I.%I',n.nspname,c.relname),', ' order by c.relname) into rels
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where c.relkind='r' and n.nspname='public'
          and c.relname not in ('toh_region_migration_apply_errors','toh_storage_migration_manifest');
        if rels is null then raise exception 'Reverse failback publication set is empty'; end if;
        execute format('create publication %I for table %s','${FAILBACK_PUBLICATION}',rels);
      end if;
    end
    \$dr\$;
SQL
    query_ref "$OREGON_REF" "$(cat "$TMP/oregon-reverse-source.sql")" "$TMP/oregon-reverse-source.json"

    cat > "$TMP/virginia-subscriber-role.sql" <<SQL
    do \$dr\$
    begin
      if exists(select 1 from pg_roles where rolname='${FAILBACK_SUBSCRIBER_ROLE}') then
        execute format('alter role %I with login noreplication password %L','${FAILBACK_SUBSCRIBER_ROLE}','${subscriber_password}');
      else
        execute format('create role %I with login noreplication password %L','${FAILBACK_SUBSCRIBER_ROLE}','${subscriber_password}');
      end if;
    end
    \$dr\$;
    grant pg_create_subscription to ${FAILBACK_SUBSCRIBER_ROLE};
    alter role ${FAILBACK_SUBSCRIBER_ROLE} set default_transaction_read_only=off;
    grant create on database postgres to ${FAILBACK_SUBSCRIBER_ROLE};
    grant usage on schema public to ${FAILBACK_SUBSCRIBER_ROLE};
    grant select,insert,update,delete,truncate on all tables in schema public to ${FAILBACK_SUBSCRIBER_ROLE};
    grant usage,select,update on all sequences in schema public to ${FAILBACK_SUBSCRIBER_ROLE};
SQL
    query_ref "$VIRGINIA_REF" "$(cat "$TMP/virginia-subscriber-role.sql")" "$TMP/virginia-subscriber-role.json"

    subscriber_user="${FAILBACK_SUBSCRIBER_ROLE}.${VIRGINIA_REF}"
    export PGPASSWORD="$subscriber_password" PGSSLMODE=require
    for _ in $(seq 1 20); do
      if psql --host="$VIRGINIA_POOLER_HOST" --port=5432 --username="$subscriber_user" --dbname=postgres -X -A -t -c 'select 1' >/dev/null 2>&1; then
        ready=true
        break
      fi
      sleep 3
    done
    test "$ready" = true || { echo 'Temporary Virginia subscriber login did not become ready.' >&2; exit 1; }

    query_ref "$VIRGINIA_REF" \
      "do \$dr\$ declare rels text; begin select string_agg(format('%I.%I',n.nspname,c.relname),', ' order by c.relname) into rels from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname='public' and c.relname not in ('toh_region_migration_apply_errors','toh_storage_migration_manifest'); if rels is null then raise exception 'Virginia reverse reseed set is empty'; end if; execute 'truncate table '||rels||' restart identity cascade'; end \$dr\$;" \
      "$TMP/virginia-reseed.json"

    cat > "$TMP/create-reverse-subscription.sql" <<SQL
    create subscription ${FAILBACK_SUBSCRIPTION}
    connection 'host=${OREGON_HOST} port=5432 dbname=postgres user=${FAILBACK_REPLICATION_ROLE} password=${password} sslmode=require application_name=${FAILBACK_SUBSCRIPTION}'
    publication ${FAILBACK_PUBLICATION}
    with (copy_data=true, create_slot=true, slot_name='${FAILBACK_SLOT}', enabled=false, disable_on_error=true, run_as_owner=true);
SQL
    psql --host="$VIRGINIA_POOLER_HOST" --port=5432 --username="$subscriber_user" --dbname=postgres \
      -X -v ON_ERROR_STOP=1 -f "$TMP/create-reverse-subscription.sql" >/dev/null
    unset PGPASSWORD PGSSLMODE
  fi

  # Supabase project postgres cannot grant SET ROLE postgres to the temporary
  # subscription owner, so PostgreSQL 17 run_as_owner=false cannot safely switch
  # into the postgres-owned target tables. Keep the temporary owner, give it the
  # narrowly required BYPASSRLS attribute, and run apply as that owner instead.
  # The role must remain LOGIN-capable for the logical apply worker, but its
  # password is cleared immediately after subscription creation so external
  # password authentication cannot use it during the DR window.
  query_ref "$VIRGINIA_REF" \
    "alter role ${FAILBACK_SUBSCRIBER_ROLE} with login noreplication bypassrls password null;" \
    "$TMP/reverse-owner-role.json"
  query_ref "$VIRGINIA_REF" \
    "select r.rolcanlogin,r.rolbypassrls,(a.rolpassword is null) password_cleared from pg_roles r join pg_authid a on a.oid=r.oid where r.rolname='${FAILBACK_SUBSCRIBER_ROLE}';" \
    "$TMP/reverse-owner-prereq.json"
  jq -e 'length==1 and .[0].rolcanlogin==true and .[0].rolbypassrls==true and .[0].password_cleared==true' "$TMP/reverse-owner-prereq.json" >/dev/null || {
    echo 'Virginia reverse subscription owner is not hardened for RLS apply.' >&2
    exit 1
  }
  # Logical replication still evaluates target-side constraints and any replica/
  # always triggers. The disposable apply owner therefore needs routine execution
  # in the application schemas used by those table-side checks. Its password is
  # already cleared, and the role is dropped during reverse-lane cleanup.
  query_ref "$VIRGINIA_REF" \
    "grant usage on schema public, fraud_internal, private to ${FAILBACK_SUBSCRIBER_ROLE}; grant execute on all functions in schema public, fraud_internal, private to ${FAILBACK_SUBSCRIBER_ROLE};" \
    "$TMP/reverse-owner-routine-grants.json"
  query_ref "$VIRGINIA_REF" \
    "select (case when has_schema_privilege('${FAILBACK_SUBSCRIBER_ROLE}','public','USAGE') then 0 else 1 end)+(case when has_schema_privilege('${FAILBACK_SUBSCRIBER_ROLE}','fraud_internal','USAGE') then 0 else 1 end)+(case when has_schema_privilege('${FAILBACK_SUBSCRIBER_ROLE}','private','USAGE') then 0 else 1 end) schema_usage_gaps,(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','fraud_internal','private') and not has_function_privilege('${FAILBACK_SUBSCRIBER_ROLE}',p.oid,'EXECUTE')) routine_execute_gaps;" \
    "$TMP/reverse-owner-routine-contract.json"
  jq -e 'length==1 and .[0].schema_usage_gaps==0 and .[0].routine_execute_gaps==0' "$TMP/reverse-owner-routine-contract.json" >/dev/null || {
    echo 'Virginia reverse subscription owner lacks required application routine privileges.' >&2
    exit 1
  }
  # postgres already has ADMIN OPTION on the temporary owner role. Add only a
  # short-lived SET membership so the management session can act as the actual
  # subscription owner, normalize the subscription, then remove that grant.
  query_ref "$VIRGINIA_REF" \
    "grant ${FAILBACK_SUBSCRIBER_ROLE} to postgres with inherit false, set true;" \
    "$TMP/reverse-owner-access.json"
  query_ref "$VIRGINIA_REF" \
    "set role ${FAILBACK_SUBSCRIBER_ROLE}; alter subscription ${FAILBACK_SUBSCRIPTION} disable; alter subscription ${FAILBACK_SUBSCRIPTION} set (run_as_owner=true); alter subscription ${FAILBACK_SUBSCRIPTION} enable; reset role;" \
    "$TMP/reverse-subscription-owner.json"
  query_ref "$VIRGINIA_REF" \
    "revoke ${FAILBACK_SUBSCRIBER_ROLE} from postgres granted by postgres;" \
    "$TMP/reverse-owner-enable.json"
  query_ref "$VIRGINIA_REF" \
    "select pg_get_userbyid(s.subowner) subscription_owner,s.subenabled,s.subrunasowner,(select rolcanlogin from pg_roles where rolname='${FAILBACK_SUBSCRIBER_ROLE}') owner_can_login,(select rolbypassrls from pg_roles where rolname='${FAILBACK_SUBSCRIBER_ROLE}') owner_bypassrls,(select rolpassword is null from pg_authid where rolname='${FAILBACK_SUBSCRIBER_ROLE}') password_cleared,(select count(*) from pg_auth_members m where m.roleid=(select oid from pg_roles where rolname='${FAILBACK_SUBSCRIBER_ROLE}') and m.member=(select oid from pg_roles where rolname='postgres') and m.grantor=(select oid from pg_roles where rolname='postgres')) temporary_set_grants from pg_subscription s where s.subname='${FAILBACK_SUBSCRIPTION}';" \
    "$TMP/reverse-owner-contract.json"
  jq -e --arg owner "$FAILBACK_SUBSCRIBER_ROLE" 'length==1 and .[0].subscription_owner==$owner and .[0].subenabled==true and .[0].subrunasowner==true and .[0].owner_can_login==true and .[0].owner_bypassrls==true and .[0].password_cleared==true and .[0].temporary_set_grants==0' "$TMP/reverse-owner-contract.json" >/dev/null || {
    echo 'Virginia reverse subscription ownership normalization failed.' >&2
    exit 1
  }

  query_ref "$OREGON_REF" "with c as (select n.nspname||'.'||x.relname rel from pg_class x join pg_namespace n on n.oid=x.relnamespace where x.relkind in ('r','p') and n.nspname='public' and x.relname not in ('toh_region_migration_apply_errors','toh_storage_migration_manifest')),p as (select schemaname||'.'||tablename rel from pg_publication_tables where pubname='${FAILBACK_PUBLICATION}') select (select count(*) from c) candidate_tables,(select count(*) from p) published_tables,(select md5(coalesce(string_agg(rel,',' order by rel),'')) from c) candidate_fp,(select md5(coalesce(string_agg(rel,',' order by rel),'')) from p) published_fp,(select count(*) from pg_replication_slots where slot_name='${FAILBACK_SLOT}') slots;" "$TMP/reverse-source-contract.json"
  jq -e '.[0].candidate_tables==.[0].published_tables and .[0].candidate_fp==.[0].published_fp and .[0].slots==1' "$TMP/reverse-source-contract.json" >/dev/null || {
    echo 'Reverse source publication/slot contract is incomplete.' >&2
    exit 1
  }

  local expected
  expected="$(wait_reverse_ready)"
  {
    echo '### Oregon DR failback preparation'
    echo ''
    echo '- Reverse public replication: ready.'
    echo "- Ready relations: \`$expected/$expected\`."
    echo '- Oregon remains production primary and writable.'
    echo '- Virginia remains fenced and non-primary.'
    echo '- No traffic switch occurred.'
  } >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
}

verify_reverse_final_gate() {
  local expected
  query_ref "$OREGON_REF" "$(candidate_sql)" "$TMP/oregon-candidate.json"
  query_ref "$VIRGINIA_REF" "$(candidate_sql)" "$TMP/virginia-candidate.json"
  cmp -s <(jq -S '.[0]' "$TMP/oregon-candidate.json") <(jq -S '.[0]' "$TMP/virginia-candidate.json") || {
    echo 'Public table inventory differs.' >&2
    exit 1
  }
  expected="$(jq -r '.[0].candidate_tables' "$TMP/oregon-candidate.json")"
  query_ref "$OREGON_REF" \
    "with p as (select schemaname||'.'||tablename rel from pg_publication_tables where pubname='${FAILBACK_PUBLICATION}') select (select count(*) from p) published,(select count(*) from pg_replication_slots where slot_name='${FAILBACK_SLOT}' and active) active_slot,coalesce((select pg_wal_lsn_diff(pg_current_wal_lsn(),confirmed_flush_lsn)::bigint from pg_replication_slots where slot_name='${FAILBACK_SLOT}'),-1) lag;" \
    "$TMP/reverse-source.json"
  query_ref "$VIRGINIA_REF" \
    "select (select count(*) from pg_subscription where subname='${FAILBACK_SUBSCRIPTION}' and subenabled) enabled,(select count(*) from pg_stat_subscription where subname='${FAILBACK_SUBSCRIPTION}' and pid is not null) workers,(select count(*) from pg_subscription_rel sr join pg_subscription s on s.oid=sr.srsubid where s.subname='${FAILBACK_SUBSCRIPTION}') total,(select count(*) from pg_subscription_rel sr join pg_subscription s on s.oid=sr.srsubid where s.subname='${FAILBACK_SUBSCRIPTION}' and sr.srsubstate='r') ready;" \
    "$TMP/reverse-target.json"
  jq -e --argjson expected "$expected" '.[0].published==$expected and .[0].active_slot==1' "$TMP/reverse-source.json" >/dev/null
  jq -e --argjson expected "$expected" '.[0].enabled==1 and .[0].workers==1 and .[0].total==$expected and .[0].ready==$expected' "$TMP/reverse-target.json" >/dev/null
}

quiet_and_zero_lag() {
  local zero=false service status code write_probe_ok=false
  service="$(cat "$TMP/oregon-service")"
  echo "::add-mask::$service"
  for _ in $(seq 1 20); do
    : > "$TMP/fence-write-probe.json"
    status="$(curl --silent --show-error --output "$TMP/fence-write-probe.json" --write-out '%{http_code}' --request PATCH \
      --header "apikey: $service" --header "Authorization: Bearer $service" \
      --header 'Content-Type: application/json' --header 'Prefer: return=minimal' \
      --data '{"name":"__dr_write_fence_probe__"}' \
      "${OREGON_URL}/rest/v1/locations?id=eq.00000000-0000-0000-0000-000000000000" || true)"
    code="$(jq -r '.code // empty' "$TMP/fence-write-probe.json" 2>/dev/null || true)"
    if [ "$code" = '25006' ]; then write_probe_ok=true; break; fi
    if [[ "$status" == 2* ]]; then
      echo 'Oregon DR write-fence probe unexpectedly permitted a service-role UPDATE.' >&2
      exit 1
    fi
    sleep 1
  done
  test "$write_probe_ok" = true || { echo 'Oregon DR write-fence probe did not prove SQLSTATE 25006.' >&2; exit 1; }
  for _ in $(seq 1 60); do
    query_ref "$OREGON_REF" "select coalesce((select pg_wal_lsn_diff(pg_current_wal_lsn(),confirmed_flush_lsn)::bigint from pg_replication_slots where slot_name='${FAILBACK_SLOT}'),-1) lag;" "$TMP/reverse-lag.json"
    if [ "$(jq -r '.[0].lag' "$TMP/reverse-lag.json")" = '0' ]; then zero=true; break; fi
    sleep 2
  done
  test "$zero" = true || { echo 'Oregon to Virginia WAL lag did not reach zero.' >&2; exit 1; }
}

invoke_reverse_reconcile() {
  local operation="$1" delete_target_only="$2" output="$3" invoker
  invoker="$(cf_output SchedulerInvokerFunctionName)"
  jq -nc --arg operation "$operation" --argjson deleteTargetOnly "$delete_target_only" \
    '{function:"dr-failback-reconciler",body:{operation:$operation,dryRun:false,oregonPrimaryConfirmed:true,oregonWritesQuiesced:true,confirmation:"FAILBACK_RECONCILE",deleteTargetOnly:$deleteTargetOnly,maxCopies:100}}' > "$TMP/reverse-input.json"
  aws lambda invoke --function-name "$invoker" --cli-binary-format raw-in-base64-out \
    --payload "fileb://$TMP/reverse-input.json" "$output" >/dev/null
  jq -e '.ok==true and .status<400 and .response.success==true' "$output" >/dev/null
}

reconcile_reverse_auth_storage() {
  local storage_ok=false
  invoke_reverse_reconcile auth false "$TMP/reverse-auth.json"
  jq -e '.response.parity==true' "$TMP/reverse-auth.json" >/dev/null
  for _ in $(seq 1 100); do
    invoke_reverse_reconcile storage true "$TMP/reverse-storage.json"
    if jq -e '.response.parity==true and .response.copyOrReplace==0 and .response.targetOnly==0 and .response.pendingDeletes==0' "$TMP/reverse-storage.json" >/dev/null; then
      storage_ok=true
      break
    fi
  done
  test "$storage_ok" = true || { echo 'Reverse Storage reconciliation did not reach exact parity.' >&2; exit 1; }
}

sync_virginia_sequences() {
  local data_sql seq_sql schema name safe
  data_sql="$(public_data_sql)"
  query_ref "$OREGON_REF" "$data_sql" "$TMP/oregon-public.json"
  query_ref "$VIRGINIA_REF" "$data_sql" "$TMP/virginia-public.json"
  cmp -s <(jq -S '.[0]' "$TMP/oregon-public.json") <(jq -S '.[0]' "$TMP/virginia-public.json") || {
    echo 'Exact public data parity is not proven.' >&2
    exit 1
  }

  seq_sql="$(cat scripts/dr/promotion-sequence-state.sql)"
  query_ref "$OREGON_REF" "$seq_sql" "$TMP/oregon-sequences.json"
  query_ref "$VIRGINIA_REF" "$seq_sql" "$TMP/virginia-sequences.json"
  jq -n --slurpfile source "$TMP/oregon-sequences.json" --slurpfile target "$TMP/virginia-sequences.json" '
    ($target[0] | map({key:(.sequence_schema+"."+.sequence_name),value:.}) | from_entries) as $t |
    $source[0] | map(. as $s | $t[$s.sequence_schema+"."+$s.sequence_name] as $v |
      {schema:$s.sequence_schema,name:$s.sequence_name,safe:([($s.sequence_last_value//0),($s.table_max_value//0),($v.sequence_last_value//0),($v.table_max_value//0),($s.start_value//1)]|map(tonumber)|max)})' > "$TMP/sequence-plan.json"
  test "$(jq 'length' "$TMP/sequence-plan.json")" = "$(jq 'length' "$TMP/oregon-sequences.json")"
  : > "$TMP/sequence-setval.sql"
  while IFS= read -r row; do
    schema="$(jq -r '.schema' <<<"$row")"
    name="$(jq -r '.name' <<<"$row")"
    safe="$(jq -r '.safe' <<<"$row")"
    [[ "$schema" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] && [[ "$name" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || {
      echo 'Unsafe sequence identifier in failback plan.' >&2
      exit 1
    }
    printf "select setval('%s.%s'::regclass,%s,true);\n" "$schema" "$name" "$safe" >> "$TMP/sequence-setval.sql"
  done < <(jq -c '.[]' "$TMP/sequence-plan.json")
  query_ref "$VIRGINIA_REF" "$(cat "$TMP/sequence-setval.sql")" "$TMP/sequence-apply.json"
  query_ref "$VIRGINIA_REF" "$seq_sql" "$TMP/virginia-sequences-after.json"
  jq -n --slurpfile plan "$TMP/sequence-plan.json" --slurpfile after "$TMP/virginia-sequences-after.json" '
    ($after[0] | map({key:(.sequence_schema+"."+.sequence_name),value:.}) | from_entries) as $a |
    all($plan[0][]; ($a[.schema+"."+.name].sequence_last_value|tonumber) >= (.safe|tonumber) and $a[.schema+"."+.name].sequence_is_called==true)' | grep -qx true
}

detach_reverse_rebuild_forward() {
  local forward_password expected ready=false sql
  query_ref "$VIRGINIA_REF" \
    "select pg_get_userbyid(subowner) owner from pg_subscription where subname='${FAILBACK_SUBSCRIPTION}';" \
    "$TMP/reverse-detach-owner.json"
  test "$(jq -r '.[0].owner // empty' "$TMP/reverse-detach-owner.json")" = "$FAILBACK_SUBSCRIBER_ROLE" || {
    echo 'Reverse subscription owner changed before detach.' >&2
    exit 1
  }
  query_ref "$VIRGINIA_REF" \
    "grant ${FAILBACK_SUBSCRIBER_ROLE} to postgres with inherit false, set true; set role ${FAILBACK_SUBSCRIBER_ROLE}; alter subscription ${FAILBACK_SUBSCRIPTION} disable; alter subscription ${FAILBACK_SUBSCRIPTION} set (slot_name = NONE); drop subscription ${FAILBACK_SUBSCRIPTION}; reset role; revoke ${FAILBACK_SUBSCRIBER_ROLE} from postgres granted by postgres;" \
    "$TMP/reverse-drop.json"
  query_ref "$VIRGINIA_REF" \
    "select count(*) temporary_set_grants from pg_auth_members m where m.roleid=(select oid from pg_roles where rolname='${FAILBACK_SUBSCRIBER_ROLE}') and m.member=(select oid from pg_roles where rolname='postgres') and m.grantor=(select oid from pg_roles where rolname='postgres');" \
    "$TMP/reverse-detach-owner-contract.json"
  jq -e 'length==1 and .[0].temporary_set_grants==0' "$TMP/reverse-detach-owner-contract.json" >/dev/null || {
    echo 'Temporary reverse-detach SET ROLE grant was not removed.' >&2
    exit 1
  }
  for _ in $(seq 1 30); do
    query_ref "$OREGON_REF" "select count(*) active from pg_replication_slots where slot_name='${FAILBACK_SLOT}' and active;" "$TMP/reverse-slot-active.json"
    [ "$(jq -r '.[0].active' "$TMP/reverse-slot-active.json")" = '0' ] && break
    sleep 2
  done
  test "$(jq -r '.[0].active' "$TMP/reverse-slot-active.json")" = '0'
  query_ref "$OREGON_REF" "select pg_drop_replication_slot('${FAILBACK_SLOT}') where exists(select 1 from pg_replication_slots where slot_name='${FAILBACK_SLOT}'); drop publication if exists ${FAILBACK_PUBLICATION}; drop owned by ${FAILBACK_REPLICATION_ROLE}; drop role if exists ${FAILBACK_REPLICATION_ROLE};" "$TMP/reverse-source-clean.json"
  query_ref "$VIRGINIA_REF" "drop owned by ${FAILBACK_SUBSCRIBER_ROLE}; drop role if exists ${FAILBACK_SUBSCRIBER_ROLE};" "$TMP/reverse-target-clean.json"

  query_ref "$OREGON_REF" "select count(*) subscriptions from pg_subscription where subname='${FORWARD_SUBSCRIPTION}';" "$TMP/forward-sub-before.json"
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
      execute format('create publication %I for table %s','${FORWARD_PUBLICATION}',rels);
    end if;
  end
  \$dr\$;
SQL
  query_ref "$VIRGINIA_REF" "$(cat "$TMP/forward-source.sql")" "$TMP/forward-source.json"

  cat > "$TMP/create-forward-subscription.sql" <<SQL
  create subscription ${FORWARD_SUBSCRIPTION}
  connection 'host=db.${VIRGINIA_REF}.supabase.co port=5432 dbname=postgres user=${FORWARD_REPLICATION_ROLE} password=${forward_password} sslmode=require application_name=${FORWARD_SUBSCRIPTION}'
  publication ${FORWARD_PUBLICATION}
  with (copy_data=false, create_slot=true, slot_name='${FORWARD_SLOT}', enabled=true, disable_on_error=true);
SQL
  psql "$OREGON_DB_URL" -X -v ON_ERROR_STOP=1 -f "$TMP/create-forward-subscription.sql" >/dev/null

  query_ref "$VIRGINIA_REF" "$(candidate_sql)" "$TMP/forward-candidate.json"
  expected="$(jq -r '.[0].candidate_tables' "$TMP/forward-candidate.json")"
  for _ in $(seq 1 90); do
    sql="select (select count(*) from pg_subscription where subname='${FORWARD_SUBSCRIPTION}' and subenabled) enabled,(select count(*) from pg_stat_subscription where subname='${FORWARD_SUBSCRIPTION}' and pid is not null) workers,(select count(*) from pg_subscription_rel sr join pg_subscription s on s.oid=sr.srsubid where s.subname='${FORWARD_SUBSCRIPTION}') total,(select count(*) from pg_subscription_rel sr join pg_subscription s on s.oid=sr.srsubid where s.subname='${FORWARD_SUBSCRIPTION}' and sr.srsubstate='r') ready;"
    query_ref "$OREGON_REF" "$sql" "$TMP/forward-ready.json"
    if jq -e --argjson expected "$expected" '.[0].enabled==1 and .[0].workers==1 and .[0].total==$expected and .[0].ready==$expected' "$TMP/forward-ready.json" >/dev/null; then ready=true; break; fi
    sleep 2
  done
  test "$ready" = true || { echo 'Rebuilt Virginia to Oregon standby lane is not ready.' >&2; exit 1; }
}

switch_runtime_vercel_to_virginia() {
  local virginia_service virginia_anon old_id new_id state ready=false
  virginia_service="$(cat "$TMP/virginia-service")"
  virginia_anon="$(cat "$TMP/virginia-anon")"
  echo "::add-mask::$virginia_service"
  echo "::add-mask::$virginia_anon"

  jq --arg url "$VIRGINIA_URL" --arg service "$virginia_service" --arg anon "$virginia_anon" \
    '. + {SUPABASE_URL:$url,UPSTREAM_SUPABASE_URL:$url,NEXT_PUBLIC_SUPABASE_URL:$url,SUPABASE_SERVICE_ROLE_KEY:$service,SUPABASE_ANON_KEY:$anon,NEXT_PUBLIC_SUPABASE_ANON_KEY:$anon}' \
    "$TMP/runtime-start.json" > "$TMP/runtime-virginia.json"
  aws secretsmanager put-secret-value --secret-id "$RUNTIME_SECRET_NAME" --secret-string "file://$TMP/runtime-virginia.json" >/dev/null
  jq --arg va "$virginia_anon" --arg oa "$(cat "$TMP/oregon-anon")" \
    '. + {DR_MODE:"virginia_primary",DR_VIRGINIA_ANON_KEY:$va,DR_OREGON_ANON_KEY:$oa}' \
    "$TMP/dr-transition.json" > "$TMP/dr-virginia.json"
  aws secretsmanager put-secret-value --secret-id "$DR_SECRET_NAME" --secret-string "file://$TMP/dr-virginia.json" >/dev/null
  bump_edge_epoch virginia-primary

  jq -n --arg url "$VIRGINIA_URL" --arg anon "$virginia_anon" --arg service "$virginia_service" '[
    {key:"NEXT_PUBLIC_SUPABASE_URL",value:$url,type:"encrypted",target:["production"]},
    {key:"NEXT_PUBLIC_SUPABASE_ANON_KEY",value:$anon,type:"encrypted",target:["production"]},
    {key:"SUPABASE_SERVICE_ROLE_KEY",value:$service,type:"encrypted",target:["production"]},
    {key:"SUPABASE_URL",value:$url,type:"encrypted",target:["production"]}
  ]' > "$TMP/vercel-env-upsert.json"
  curl --fail --silent --show-error --request POST \
    --header "Authorization: Bearer $VERCEL_TOKEN" --header 'Content-Type: application/json' \
    --data-binary "@$TMP/vercel-env-upsert.json" \
    "https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env?upsert=true&teamId=${VERCEL_TEAM_ID}" > "$TMP/vercel-env-upsert-response.json"

  # Oregon is fenced. Virginia becomes the only writable project before the replacement production deployment can receive traffic.
  unfence_roles "$VIRGINIA_REF" "$TMP/virginia-unfence.json"

  curl --fail --silent --show-error --header "Authorization: Bearer $VERCEL_TOKEN" \
    "https://api.vercel.com/v7/deployments?projectId=${VERCEL_PROJECT_ID}&target=production&limit=1&teamId=${VERCEL_TEAM_ID}" > "$TMP/current-deployment.json"
  old_id="$(jq -r '.deployments[0].uid // .deployments[0].id // empty' "$TMP/current-deployment.json")"
  test -n "$old_id"
  jq -n --arg name "$VERCEL_PROJECT_NAME" --arg project "$VERCEL_PROJECT_ID" --arg deploymentId "$old_id" \
    '{name:$name,project:$project,deploymentId:$deploymentId,target:"production"}' > "$TMP/vercel-redeploy.json"
  curl --fail --silent --show-error --request POST \
    --header "Authorization: Bearer $VERCEL_TOKEN" --header 'Content-Type: application/json' \
    --data-binary "@$TMP/vercel-redeploy.json" \
    "https://api.vercel.com/v13/deployments?forceNew=1&teamId=${VERCEL_TEAM_ID}" > "$TMP/vercel-new-deployment.json"
  new_id="$(jq -r '.id // .uid // empty' "$TMP/vercel-new-deployment.json")"
  test -n "$new_id"
  for _ in $(seq 1 120); do
    curl --fail --silent --show-error --header "Authorization: Bearer $VERCEL_TOKEN" \
      "https://api.vercel.com/v13/deployments/${new_id}?teamId=${VERCEL_TEAM_ID}" > "$TMP/vercel-deployment-status.json"
    state="$(jq -r '.readyState // .state // empty' "$TMP/vercel-deployment-status.json")"
    if [ "$state" = 'READY' ]; then ready=true; break; fi
    if [ "$state" = 'ERROR' ] || [ "$state" = 'CANCELED' ]; then
      echo "Vercel failback deployment entered $state" >&2
      exit 1
    fi
    sleep 5
  done
  test "$ready" = true || { echo 'Virginia Vercel production deployment did not become READY.' >&2; exit 1; }
}

restore_forward_dr() {
  local invoker
  # Application/runtime traffic now points only at Virginia. Re-enable Oregon service roles solely so forward Auth/Storage reconciliation can operate.
  unfence_roles "$OREGON_REF" "$TMP/oregon-unfence.json"
  invoker="$(cf_output SchedulerInvokerFunctionName)"
  printf '%s' '{"function":"dr-standby-reconciler","body":{"operation":"status","dryRun":true}}' > "$TMP/standby-status-input.json"
  aws lambda invoke --function-name "$invoker" --cli-binary-format raw-in-base64-out \
    --payload "fileb://$TMP/standby-status-input.json" "$TMP/standby-status.json" >/dev/null
  jq -e '.ok==true and .status<400 and .response.success==true and .response.auth.parity==true and .response.storage.parity==true' "$TMP/standby-status.json" >/dev/null

  set_manifest_state "$BASE_MANIFEST" ENABLED
  set_manifest_state "$DR_MANIFEST" ENABLED

  aws secretsmanager get-secret-value --secret-id "$DR_SECRET_NAME" --query SecretString --output text > "$TMP/dr-final.json"
  jq -e '.DR_MODE=="virginia_primary"' "$TMP/dr-final.json" >/dev/null
  aws secretsmanager get-secret-value --secret-id "$RUNTIME_SECRET_NAME" --query SecretString --output text > "$TMP/runtime-final.json"
  test "$(jq -r '.SUPABASE_URL' "$TMP/runtime-final.json")" = "$VIRGINIA_URL"
  curl --fail --silent --show-error --header "Authorization: Bearer $VERCEL_TOKEN" \
    "https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env?teamId=${VERCEL_TEAM_ID}&decrypt=true" > "$TMP/vercel-final.json"
  test "$(jq -r '[.envs[] | select(.key=="NEXT_PUBLIC_SUPABASE_URL" and .target==["production"])][0].type // empty' "$TMP/vercel-final.json")" = 'encrypted'
  test "$(resolve_vercel_public_url "$TMP/vercel-final.json" "$TMP/vercel-final-detail.json" || true)" = "$VIRGINIA_URL"
  test "$(verify_manifest_state "$BASE_MANIFEST" ENABLED)" = "$(jq 'length' "$BASE_MANIFEST")"
  test "$(verify_manifest_state "$DR_MANIFEST" ENABLED)" = '2'
  query_ref "$VIRGINIA_REF" "select (select count(*) from cron.job) cron_jobs,(select count(*) from pg_db_role_setting s join pg_database d on d.oid=s.setdatabase where d.datname='postgres' and s.setrole=0 and coalesce(array_to_string(s.setconfig,','),'') like '%default_transaction_read_only=on%') database_fences,(select count(*) from pg_roles where rolname='authenticator' and coalesce(array_to_string(rolconfig,','),'') like '%pgrst.db_pre_request=public.theouthaven_dr_pre_request%') dr_pre_request_configured;" "$TMP/virginia-cron-final.json"
  query_ref "$OREGON_REF" "select (select count(*) from cron.job where active) active_cron_jobs,(select count(*) from pg_db_role_setting s join pg_database d on d.oid=s.setdatabase where d.datname='postgres' and s.setrole=0 and coalesce(array_to_string(s.setconfig,','),'') like '%default_transaction_read_only=on%') database_fences,(select count(*) from pg_roles where rolname='authenticator' and coalesce(array_to_string(rolconfig,','),'') like '%pgrst.db_pre_request=public.theouthaven_dr_pre_request%') dr_pre_request_configured;" "$TMP/oregon-cron-final.json"
  jq -e '.[0].cron_jobs==0 and .[0].database_fences==0 and .[0].dr_pre_request_configured==1' "$TMP/virginia-cron-final.json" >/dev/null
  jq -e '.[0].active_cron_jobs==0 and .[0].database_fences==0 and .[0].dr_pre_request_configured==1' "$TMP/oregon-cron-final.json" >/dev/null

  {
    echo '### Oregon DR failback complete'
    echo ''
    echo '- Production primary: `Virginia`.'
    echo '- Oregon: passive standby.'
    echo '- Forward public replication: rebuilt and ready.'
    echo '- Auth/Storage parity: verified.'
    echo '- Base schedules: 24 enabled.'
    echo '- Isolated forward DR schedules: 2 enabled.'
    echo '- Supabase pg_cron remains inactive by policy.'
    echo '- Session policy: `reauthentication_required`.'
  } >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
}

final_failback() {
  verify_reverse_final_gate
  set_manifest_state "$BASE_MANIFEST" DISABLED
  jq '.DR_MODE="failback_in_progress"' "$TMP/dr-start.json" > "$TMP/dr-transition.json"
  aws secretsmanager put-secret-value --secret-id "$DR_SECRET_NAME" --secret-string "file://$TMP/dr-transition.json" >/dev/null
  bump_edge_epoch failback-fence
  fence_roles "$OREGON_REF" "$TMP/oregon-fence.json"
  quiet_and_zero_lag
  reconcile_reverse_auth_storage
  sync_virginia_sequences
  detach_reverse_rebuild_forward
  switch_runtime_vercel_to_virginia
  restore_forward_dr
}

main() {
  local action="${1:-}" confirmation="${CONFIRMATION:-}" quiesced="${OREGON_WRITES_QUIESCED:-false}" recovery="${FAIL_CLOSED_RECOVERY:-false}"
  require_tools
  test -n "${SUPABASE_ACCESS_TOKEN:-}" || { echo 'Missing SUPABASE_ACCESS_TOKEN.' >&2; exit 1; }
  test -n "${VERCEL_TOKEN:-}" || { echo 'Missing VERCEL_TOKEN.' >&2; exit 1; }
  test -n "${OREGON_DB_URL:-}" || { echo 'Missing OREGON_DB_URL.' >&2; exit 1; }
  case "$OREGON_DB_URL" in *"$OREGON_REF"*) ;; *) echo 'OREGON_DB_URL is not scoped to Oregon DR.' >&2; exit 1 ;; esac
  base_expected="$(jq 'length' "$BASE_MANIFEST")"
  test "$base_expected" -ge 24
  test "$(jq -r '.[].name' "$BASE_MANIFEST" | sort | uniq | wc -l | tr -d ' ')" = "$base_expected"
  test "$(jq 'length' "$DR_MANIFEST")" = '2'

  case "$action" in
    prepare)
      test "$recovery" = 'false' || { echo 'Prepare does not support fail-closed recovery mode.' >&2; exit 1; }
      test "$confirmation" = 'PREPARE_FAILBACK' || { echo 'Prepare requires PREPARE_FAILBACK.' >&2; exit 1; }
      ;;
    failback)
      if [ "$recovery" = 'true' ]; then
        test "$confirmation" = 'RECOVER_FAILBACK_VIRGINIA' || { echo 'Fail-closed recovery requires RECOVER_FAILBACK_VIRGINIA.' >&2; exit 1; }
      else
        test "$confirmation" = 'FAILBACK_VIRGINIA' || { echo 'Final failback requires FAILBACK_VIRGINIA.' >&2; exit 1; }
      fi
      test "$quiesced" = 'true' || { echo 'Final failback requires OREGON_WRITES_QUIESCED=true.' >&2; exit 1; }
      ;;
    *) echo 'Usage: oregon-failback.sh prepare|failback' >&2; exit 2 ;;
  esac

  verify_oregon_primary_start "$recovery"
  resolve_project_keys
  if [ "$action" = 'prepare' ]; then
    prepare_reverse_lane
  else
    final_failback
  fi
}

main "$@"
