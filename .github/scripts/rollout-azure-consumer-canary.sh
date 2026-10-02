#!/usr/bin/env bash
set -euo pipefail

: "${AZURE_RESOURCE_GROUP:?AZURE_RESOURCE_GROUP is required}"
: "${PRIMARY_APP:?PRIMARY_APP is required}"
: "${SECONDARY_APP:?SECONDARY_APP is required}"
: "${PRIMARY_PREVIOUS_REVISION:?PRIMARY_PREVIOUS_REVISION is required}"
: "${SECONDARY_PREVIOUS_REVISION:?SECONDARY_PREVIOUS_REVISION is required}"
: "${PRIMARY_CANDIDATE_REVISION:?PRIMARY_CANDIDATE_REVISION is required}"
: "${SECONDARY_CANDIDATE_REVISION:?SECONDARY_CANDIDATE_REVISION is required}"
: "${PRIMARY_CANDIDATE_FQDN:?PRIMARY_CANDIDATE_FQDN is required}"
: "${SECONDARY_CANDIDATE_FQDN:?SECONDARY_CANDIDATE_FQDN is required}"
: "${PRIMARY_APP_FQDN:?PRIMARY_APP_FQDN is required}"
: "${SECONDARY_APP_FQDN:?SECONDARY_APP_FQDN is required}"
: "${IMAGE_SHA:?IMAGE_SHA is required}"
: "${RELEASE_ID:?RELEASE_ID is required}"

record_state() {
  local state="$1"
  local event="$2"
  local reason="${3:-}"
  local evidence="${4:-}"
  if [ -z "$evidence" ]; then
    evidence='{}'
  fi
  RELEASE_STATE="$state" \
  RELEASE_EVENT_TYPE="$event" \
  RELEASE_REASON="$reason" \
  RELEASE_EVIDENCE="$evidence" \
  GIT_SHA="$IMAGE_SHA" \
  RELEASE_ID="$RELEASE_ID" \
  bash .github/scripts/write-platform-release.sh
}

set_region_weight() {
  local app="$1"
  local previous="$2"
  local candidate="$3"
  local candidate_weight="$4"
  local previous_weight=$((100 - candidate_weight))
  az containerapp ingress traffic set \
    --resource-group "$AZURE_RESOURCE_GROUP" \
    --name "$app" \
    --revision-weight "$previous=$previous_weight" "$candidate=$candidate_weight" \
    --output none
}

verify_region_weight() {
  local app="$1"
  local previous="$2"
  local candidate="$3"
  local candidate_weight="$4"
  local previous_weight=$((100 - candidate_weight))
  local traffic
  traffic="$(az containerapp show \
    --resource-group "$AZURE_RESOURCE_GROUP" \
    --name "$app" \
    --query 'properties.configuration.ingress.traffic' \
    -o json)"
  jq -e \
    --arg previous "$previous" \
    --arg candidate "$candidate" \
    --argjson previous_weight "$previous_weight" \
    --argjson candidate_weight "$candidate_weight" \
    '
      def weight_matches($revision; $expected):
        ([.[] | select(.revisionName == $revision)] | first) as $entry
        | if $expected == 0
          then ($entry == null or ($entry.weight // 0) == 0)
          else ($entry != null and $entry.weight == $expected)
          end;
      weight_matches($previous; $previous_weight)
      and weight_matches($candidate; $candidate_weight)
    ' \
    <<<"$traffic" >/dev/null
}

set_weight() {
  local weight="$1"
  set_region_weight "$PRIMARY_APP" "$PRIMARY_PREVIOUS_REVISION" "$PRIMARY_CANDIDATE_REVISION" "$weight"
  set_region_weight "$SECONDARY_APP" "$SECONDARY_PREVIOUS_REVISION" "$SECONDARY_CANDIDATE_REVISION" "$weight"
  verify_region_weight "$PRIMARY_APP" "$PRIMARY_PREVIOUS_REVISION" "$PRIMARY_CANDIDATE_REVISION" "$weight"
  verify_region_weight "$SECONDARY_APP" "$SECONDARY_PREVIOUS_REVISION" "$SECONDARY_CANDIDATE_REVISION" "$weight"
}

prove_candidate_direct() {
  python3 .github/scripts/prove-azure-frontdoor.py \
    --host "$PRIMARY_CANDIDATE_FQDN" --sha "$IMAGE_SHA" --roles primary \
    --attempts 24 --interval 10 --label "primary candidate revision"
  python3 .github/scripts/prove-azure-frontdoor.py \
    --host "$SECONDARY_CANDIDATE_FQDN" --sha "$IMAGE_SHA" --roles secondary \
    --attempts 24 --interval 10 --label "secondary candidate revision"
}

prove_application_health() {
  local weight="$1"
  python3 .github/scripts/prove-azure-frontdoor.py \
    --host "$PRIMARY_CANDIDATE_FQDN" --sha "$IMAGE_SHA" --roles primary \
    --attempts 12 --interval 10 --label "primary canary candidate at ${weight}%"
  python3 .github/scripts/prove-azure-frontdoor.py \
    --host "$SECONDARY_CANDIDATE_FQDN" --sha "$IMAGE_SHA" --roles secondary \
    --attempts 12 --interval 10 --label "secondary canary candidate at ${weight}%"
  curl --fail --silent --show-error --connect-timeout 10 --max-time 20 "https://$PRIMARY_APP_FQDN/api/health/azure" >/dev/null
  curl --fail --silent --show-error --connect-timeout 10 --max-time 20 "https://$SECONDARY_APP_FQDN/api/health/azure" >/dev/null
}

rollback() {
  local rc="$?"
  trap - ERR
  set +e
  record_state "ROLLING_BACK" "canary_rollback_started" "azure_consumer_canary_gate_failed" \
    '{"workflow":"azure-consumer-production","rollout":"0-10-50-100","action":"restore_previous_good"}'
  set_region_weight "$PRIMARY_APP" "$PRIMARY_PREVIOUS_REVISION" "$PRIMARY_CANDIDATE_REVISION" 0
  set_region_weight "$SECONDARY_APP" "$SECONDARY_PREVIOUS_REVISION" "$SECONDARY_CANDIDATE_REVISION" 0
  az containerapp revision deactivate --resource-group "$AZURE_RESOURCE_GROUP" --name "$PRIMARY_APP" --revision "$PRIMARY_CANDIDATE_REVISION" --output none
  az containerapp revision deactivate --resource-group "$AZURE_RESOURCE_GROUP" --name "$SECONDARY_APP" --revision "$SECONDARY_CANDIDATE_REVISION" --output none
  verify_region_weight "$PRIMARY_APP" "$PRIMARY_PREVIOUS_REVISION" "$PRIMARY_CANDIDATE_REVISION" 0
  verify_region_weight "$SECONDARY_APP" "$SECONDARY_PREVIOUS_REVISION" "$SECONDARY_CANDIDATE_REVISION" 0
  record_state "ROLLED_BACK" "canary_rollback_completed" "azure_consumer_canary_gate_failed" \
    '{"workflow":"azure-consumer-production","rollout":"0-10-50-100","result":"previous_good_restored"}'
  exit "$rc"
}
trap rollback ERR

prove_candidate_direct
record_state "CANARY" "canary_candidate_proven" "" \
  '{"workflow":"azure-consumer-production","traffic_percent":0,"gate":"direct_revision_health"}'

set_weight 10
prove_application_health 10
record_state "CANARY" "canary_10_percent_passed" "" \
  '{"workflow":"azure-consumer-production","traffic_percent":10,"gate":"regional_health"}'

set_weight 50
prove_application_health 50
record_state "PROMOTING" "canary_50_percent_passed" "" \
  '{"workflow":"azure-consumer-production","traffic_percent":50,"gate":"regional_health"}'

set_weight 100
prove_application_health 100
record_state "PROMOTING" "canary_100_percent_regional_passed" "" \
  '{"workflow":"azure-consumer-production","traffic_percent":100,"gate":"regional_health"}'

trap - ERR
echo "Azure consumer canary rollout reached 100% candidate traffic in both regions."
