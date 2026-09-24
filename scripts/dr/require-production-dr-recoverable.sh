#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN is required}"
VIRGINIA_REF="${VIRGINIA_REF:-ftdsltatyqhtllyyefzp}"
OREGON_REF="${OREGON_REF:-hnhbzynoyrhjndefbwkh}"
PUBLICATION="${EXPECTED_PUBLICATION:-theouthaven_dr_publication}"
SUBSCRIPTION="${EXPECTED_SUBSCRIPTION:-theouthaven_va_to_or_dr}"
SLOT="${EXPECTED_SLOT:-theouthaven_va_to_or_dr_slot}"

query_ref() {
  local ref="$1" sql="$2" out="$3"
  jq -n --arg query "$sql" '{query:$query}' > "$RUNNER_TEMP/query.json"
  curl --fail --silent --show-error --request POST     --header "Authorization: Bearer $SUPABASE_ACCESS_TOKEN"     --header 'Content-Type: application/json'     --data-binary "@$RUNNER_TEMP/query.json"     "https://api.supabase.com/v1/projects/${ref}/database/query" > "$out"
}

query_ref "$VIRGINIA_REF" "select
  (select count(*) from pg_publication where pubname='${PUBLICATION}') publications,
  (select count(*) from pg_replication_slots where slot_name='${SLOT}') slots,
  (select coalesce(wal_status,'') from pg_replication_slots where slot_name='${SLOT}') wal_status,
  (select coalesce(invalidation_reason,'') from pg_replication_slots where slot_name='${SLOT}') invalidation_reason,
  (select count(*) from cron.job) cron_jobs;" "$RUNNER_TEMP/recoverable-source.json"

query_ref "$OREGON_REF" "select
  (select count(*) from pg_subscription where subname='${SUBSCRIPTION}') subscriptions,
  (select count(*) from cron.job where active) active_cron_jobs;" "$RUNNER_TEMP/recoverable-target.json"

jq -e '.[0]
  | .publications == 1
  and .slots == 1
  and .wal_status != "lost"
  and (.invalidation_reason == "" or .invalidation_reason == null)
  and .cron_jobs == 0' "$RUNNER_TEMP/recoverable-source.json" >/dev/null || {
    echo "DR topology is not safely auto-repairable; protected recovery is required." >&2
    jq -c '.[0]' "$RUNNER_TEMP/recoverable-source.json" >&2
    exit 1
  }

jq -e '.[0] | .subscriptions == 1 and .active_cron_jobs == 0' "$RUNNER_TEMP/recoverable-target.json" >/dev/null || {
  echo "Oregon topology is not safely auto-repairable; protected recovery is required." >&2
  jq -c '.[0]' "$RUNNER_TEMP/recoverable-target.json" >&2
  exit 1
}

echo "production_dr_topology=recoverable"
