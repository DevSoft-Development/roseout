#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_URL:?SUPABASE_URL is required}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required}"
: "${RELEASE_ID:?RELEASE_ID is required}"
: "${GIT_SHA:?GIT_SHA is required}"
: "${RELEASE_STATE:?RELEASE_STATE is required}"
: "${RELEASE_EVENT_TYPE:?RELEASE_EVENT_TYPE is required}"

RELEASE_SURFACE="${RELEASE_SURFACE:-consumer}"
RELEASE_PROVIDER="${RELEASE_PROVIDER:-azure}"
RELEASE_ENVIRONMENT="${RELEASE_ENVIRONMENT:-production}"
RELEASE_SOURCE="${RELEASE_SOURCE:-github-actions}"
RELEASE_ACTOR="${RELEASE_ACTOR:-github}"
RELEASE_ARTIFACT_REF="${RELEASE_ARTIFACT_REF:-}"
RELEASE_REASON="${RELEASE_REASON:-}"
RELEASE_EVIDENCE="${RELEASE_EVIDENCE:-}"
if [ -z "$RELEASE_EVIDENCE" ]; then
  RELEASE_EVIDENCE='{}'
fi
AWS_ADMIN_IMAGE="${AWS_ADMIN_IMAGE:-}"
AWS_BUSINESS_IMAGE="${AWS_BUSINESS_IMAGE:-}"
AWS_RESERVE_IMAGE="${AWS_RESERVE_IMAGE:-}"
WORKER_RELEASE="${WORKER_RELEASE:-}"
IOS_BUILD="${IOS_BUILD:-}"
ANDROID_BUILD="${ANDROID_BUILD:-}"
RUNTIME_VERSION="${RUNTIME_VERSION:-}"
OTA_RELEASE="${OTA_RELEASE:-}"

case "$RELEASE_STATE" in
  BUILDING|VALIDATING|CANDIDATE|CANARY|PROMOTING|STABLE|DEGRADED|ROLLING_BACK|ROLLED_BACK|FAILED) ;;
  *) echo "::error::Invalid release state: $RELEASE_STATE" >&2; exit 1 ;;
esac

api() {
  curl --fail-with-body --silent --show-error \
    --connect-timeout 10 \
    --max-time 60 \
    --retry 5 \
    --retry-delay 2 \
    --retry-max-time 45 \
    --retry-all-errors \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    "$@"
}

base="${SUPABASE_URL%/}/rest/v1"

current_json="$(api "$base/platform_releases?release_id=eq.$RELEASE_ID&select=state&limit=1")"
prior_state="$(jq -r '.[0].state // empty' <<<"$current_json")"

previous_json="$(api "$base/platform_releases?surface=eq.$RELEASE_SURFACE&provider=eq.$RELEASE_PROVIDER&environment=eq.$RELEASE_ENVIRONMENT&state=eq.STABLE&release_id=neq.$RELEASE_ID&select=release_id&order=promoted_at.desc.nullslast,created_at.desc&limit=1")"
previous_good="$(jq -r '.[0].release_id // empty' <<<"$previous_json")"

now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
deployed_at=null
promoted_at=null
case "$RELEASE_STATE" in
  VALIDATING|CANARY|PROMOTING|STABLE|DEGRADED|ROLLING_BACK|ROLLED_BACK|FAILED)
    deployed_at="$(jq -Rn --arg v "$now" '$v')" ;;
esac
if [ "$RELEASE_STATE" = "STABLE" ]; then
  promoted_at="$(jq -Rn --arg v "$now" '$v')"
fi

release_payload="$(jq -n \
  --arg release_id "$RELEASE_ID" \
  --arg git_sha "$GIT_SHA" \
  --arg surface "$RELEASE_SURFACE" \
  --arg provider "$RELEASE_PROVIDER" \
  --arg environment "$RELEASE_ENVIRONMENT" \
  --arg state "$RELEASE_STATE" \
  --arg previous_good_release_id "$previous_good" \
  --arg artifact_ref "$RELEASE_ARTIFACT_REF" \
  --arg rollback_reason "$RELEASE_REASON" \
  --arg aws_admin_image "$AWS_ADMIN_IMAGE" \
  --arg aws_business_image "$AWS_BUSINESS_IMAGE" \
  --arg aws_reserve_image "$AWS_RESERVE_IMAGE" \
  --arg worker_release "$WORKER_RELEASE" \
  --arg ios_build "$IOS_BUILD" \
  --arg android_build "$ANDROID_BUILD" \
  --arg runtime_version "$RUNTIME_VERSION" \
  --arg ota_release "$OTA_RELEASE" \
  --argjson deployed_at "$deployed_at" \
  --argjson promoted_at "$promoted_at" \
  --argjson metadata "$(jq -c . <<<"$RELEASE_EVIDENCE")" \
  '{
    release_id:$release_id,
    git_sha:$git_sha,
    surface:$surface,
    provider:$provider,
    environment:$environment,
    state:$state,
    metadata:$metadata,
    updated_at:(now|todate)
  }
  + (if $previous_good_release_id != "" then {previous_good_release_id:$previous_good_release_id} else {} end)
  + (if $artifact_ref != "" then {artifact_ref:$artifact_ref} else {} end)
  + (if $rollback_reason != "" then {rollback_reason:$rollback_reason} else {} end)
  + (if $aws_admin_image != "" then {aws_admin_image:$aws_admin_image} else {} end)
  + (if $aws_business_image != "" then {aws_business_image:$aws_business_image} else {} end)
  + (if $aws_reserve_image != "" then {aws_reserve_image:$aws_reserve_image} else {} end)
  + (if $worker_release != "" then {worker_release:$worker_release} else {} end)
  + (if $ios_build != "" then {ios_build:$ios_build} else {} end)
  + (if $android_build != "" then {android_build:$android_build} else {} end)
  + (if $runtime_version != "" then {runtime_version:$runtime_version} else {} end)
  + (if $ota_release != "" then {ota_release:$ota_release} else {} end)
  + (if $deployed_at != null then {deployed_at:$deployed_at} else {} end)
  + (if $promoted_at != null then {promoted_at:$promoted_at} else {} end)')"

api -X POST \
  -H "content-type: application/json" \
  -H "prefer: resolution=merge-duplicates,return=minimal" \
  --data "$release_payload" \
  "$base/platform_releases?on_conflict=release_id" >/dev/null

event_payload="$(jq -n \
  --arg release_id "$RELEASE_ID" \
  --arg event_type "$RELEASE_EVENT_TYPE" \
  --arg prior_state "$prior_state" \
  --arg new_state "$RELEASE_STATE" \
  --arg source "$RELEASE_SOURCE" \
  --arg provider "$RELEASE_PROVIDER" \
  --arg actor "$RELEASE_ACTOR" \
  --arg reason "$RELEASE_REASON" \
  --argjson evidence "$(jq -c . <<<"$RELEASE_EVIDENCE")" \
  '{
    release_id:$release_id,
    event_type:$event_type,
    new_state:$new_state,
    source:$source,
    provider:$provider,
    actor:$actor,
    evidence:$evidence
  }
  + (if $prior_state != "" then {prior_state:$prior_state} else {} end)
  + (if $reason != "" then {reason:$reason} else {} end)')"

api -X POST \
  -H "content-type: application/json" \
  -H "prefer: return=minimal" \
  --data "$event_payload" \
  "$base/platform_release_events" >/dev/null

echo "Recorded $RELEASE_ID: ${prior_state:-<none>} -> $RELEASE_STATE ($RELEASE_EVENT_TYPE)"
