#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_URL:?SUPABASE_URL is required}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required}"

OUT="${CODEBUILD_SRC_DIR:-/tmp}/worker-soak.json"
curl --fail-with-body --silent --show-error \
  -X POST "$SUPABASE_URL/rest/v1/rpc/worker_reliability_soak_report" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' \
  --data '{"p_window_days":7}' > "$OUT"

jq . "$OUT"
STATE="$(jq -r '.state' "$OUT")"
OBSERVED="$(jq -r '.observed_days' "$OUT")"
if [ "$STATE" = "collecting" ]; then
  echo "Seven-day soak is still collecting data (${OBSERVED} observed days)."
  exit 0
fi
jq -e '.passing == true' "$OUT" >/dev/null
echo "Seven-day worker reliability soak passed."
