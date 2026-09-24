#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN is required}"

VIRGINIA_REF="${VIRGINIA_REF:-ftdsltatyqhtllyyefzp}"
OREGON_REF="${OREGON_REF:-hnhbzynoyrhjndefbwkh}"
PUBLICATION="${EXPECTED_PUBLICATION:-theouthaven_dr_publication}"
SUBSCRIPTION="${EXPECTED_SUBSCRIPTION:-theouthaven_va_to_or_dr}"
SLOT="${EXPECTED_SLOT:-theouthaven_va_to_or_dr_slot}"
MAX_LAG_BYTES="${MAX_DR_LAG_BYTES:-67108864}"

query_ref() {
  local ref="$1" sql="$2" out="$3"
  jq -n --arg query "$sql" '{query:$query}' > "$RUNNER_TEMP/query.json"
  curl --fail --silent --show-error --request POST     --header "Authorization: Bearer $SUPABASE_ACCESS_TOKEN"     --header 'Content-Type: application/json'     --data-binary "@$RUNNER_TEMP/query.json"     "https://api.supabase.com/v1/projects/${ref}/database/query" > "$out"
}

catalog_sql="$(cat scripts/dr/writable-catalog.sql)"
query_ref "$VIRGINIA_REF" "$catalog_sql" "$RUNNER_TEMP/virginia-catalog.json"
query_ref "$OREGON_REF" "$catalog_sql" "$RUNNER_TEMP/oregon-catalog.json"

jq -e 'type == "array" and length > 0' "$RUNNER_TEMP/virginia-catalog.json" >/dev/null
jq -e 'type == "array" and length > 0' "$RUNNER_TEMP/oregon-catalog.json" >/dev/null
jq -S 'sort_by(.kind,.object_name,.item_name)' "$RUNNER_TEMP/virginia-catalog.json" > "$RUNNER_TEMP/virginia-catalog-normalized.json"
jq -S 'sort_by(.kind,.object_name,.item_name)' "$RUNNER_TEMP/oregon-catalog.json" > "$RUNNER_TEMP/oregon-catalog-normalized.json"

if ! cmp -s "$RUNNER_TEMP/virginia-catalog-normalized.json" "$RUNNER_TEMP/oregon-catalog-normalized.json"; then
  echo "Virginia/Oregon writable catalog parity is unhealthy." >&2
  diff -u     <(jq -r '.[] | [.kind,.object_name,.item_name,.definition_hash] | @tsv' "$RUNNER_TEMP/virginia-catalog-normalized.json")     <(jq -r '.[] | [.kind,.object_name,.item_name,.definition_hash] | @tsv' "$RUNNER_TEMP/oregon-catalog-normalized.json")     | head -n 120 || true
  exit 1
fi

source_sql="with candidate as (
  select n.nspname||'.'||c.relname rel
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where c.relkind in ('r','p') and n.nspname='public'
    and c.relname not in ('toh_region_migration_apply_errors','toh_storage_migration_manifest')
), published as (
  select schemaname||'.'||tablename rel
  from pg_publication_tables where pubname='${PUBLICATION}'
)
select
  (select count(*) from pg_publication where pubname='${PUBLICATION}') publications,
  (select count(*) from candidate) candidate_tables,
  (select count(*) from published) published_tables,
  (select md5(coalesce(string_agg(rel,',' order by rel),'')) from candidate) candidate_fp,
  (select md5(coalesce(string_agg(rel,',' order by rel),'')) from published) published_fp,
  (select count(*) from pg_replication_slots where slot_name='${SLOT}') slots,
  (select count(*) from pg_replication_slots where slot_name='${SLOT}' and active) active_slots,
  (select coalesce(wal_status,'') from pg_replication_slots where slot_name='${SLOT}') wal_status,
  (select coalesce(invalidation_reason,'') from pg_replication_slots where slot_name='${SLOT}') invalidation_reason,
  (select coalesce(pg_wal_lsn_diff(pg_current_wal_lsn(),confirmed_flush_lsn),0)::bigint from pg_replication_slots where slot_name='${SLOT}') lag_bytes,
  (select count(*) from cron.job) cron_jobs;"

target_sql="with candidate as (
  select n.nspname||'.'||c.relname rel
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where c.relkind in ('r','p') and n.nspname='public'
    and c.relname not in ('toh_region_migration_apply_errors','toh_storage_migration_manifest')
), subscribed as (
  select n.nspname||'.'||c.relname rel
  from pg_subscription_rel sr
  join pg_subscription s on s.oid=sr.srsubid
  join pg_class c on c.oid=sr.srrelid
  join pg_namespace n on n.oid=c.relnamespace
  where s.subname='${SUBSCRIPTION}'
)
select
  (select count(*) from candidate) candidate_tables,
  (select count(*) from subscribed) subscribed_tables,
  (select md5(coalesce(string_agg(rel,',' order by rel),'')) from candidate) candidate_fp,
  (select md5(coalesce(string_agg(rel,',' order by rel),'')) from subscribed) subscribed_fp,
  (select count(*) from pg_subscription where subname='${SUBSCRIPTION}') subscriptions,
  (select count(*) from pg_subscription where subname='${SUBSCRIPTION}' and subenabled) enabled_subscriptions,
  (select count(*) from pg_subscription s join pg_stat_subscription st on st.subid=s.oid where s.subname='${SUBSCRIPTION}' and st.pid is not null) connected_workers,
  (select count(*) from pg_subscription_rel sr join pg_subscription s on s.oid=sr.srsubid where s.subname='${SUBSCRIPTION}' and sr.srsubstate<>'r') pending_tables,
  (select count(*) from cron.job where active) active_cron_jobs;"

query_ref "$VIRGINIA_REF" "$source_sql" "$RUNNER_TEMP/source-health.json"
query_ref "$OREGON_REF" "$target_sql" "$RUNNER_TEMP/target-health.json"

jq -e   --argjson max_lag "$MAX_LAG_BYTES"   '.[0]
   | .publications == 1
   and .candidate_tables == .published_tables
   and .candidate_fp == .published_fp
   and .slots == 1
   and .active_slots == 1
   and .wal_status != "lost"
   and (.invalidation_reason == "" or .invalidation_reason == null)
   and (.lag_bytes // 0) >= 0
   and (.lag_bytes // 0) <= $max_lag
   and .cron_jobs == 0'   "$RUNNER_TEMP/source-health.json" >/dev/null || {
    echo "Virginia DR source health gate failed." >&2
    jq -c '.[0]' "$RUNNER_TEMP/source-health.json" >&2
    exit 1
  }

jq -e   '.[0]
   | .candidate_tables == .subscribed_tables
   and .candidate_fp == .subscribed_fp
   and .subscriptions == 1
   and .enabled_subscriptions == 1
   and .connected_workers >= 1
   and .pending_tables == 0
   and .active_cron_jobs == 0'   "$RUNNER_TEMP/target-health.json" >/dev/null || {
    echo "Oregon DR target health gate failed." >&2
    jq -c '.[0]' "$RUNNER_TEMP/target-health.json" >&2
    exit 1
  }

echo "production_dr_health=healthy"
