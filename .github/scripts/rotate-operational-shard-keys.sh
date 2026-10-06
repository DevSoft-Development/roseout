#!/usr/bin/env bash
set -euo pipefail

: "${AWS_REGION:=us-east-1}"
: "${AWS_ACCOUNT_ID:=742020474738}"
: "${SUPABASE_VAULT_SECRET:=/theouthaven/credential-vault/production/supabase}"
: "${DR_SECRET:=/theouthaven/production/dr-reconciler/env}"
: "${RUNTIME_SECRET:=/theouthaven/production/edge-runtime/env}"
: "${SHARD01_REF:=lyeruuzsnceaxrmdafxb}"
: "${SHARD01_DR_REF:=vcdnwrsuvhtlvxqbkamg}"
: "${SHARD02_REF:=lpcrikaixcfbqaikevlg}"
: "${SHARD02_DR_REF:=bjhcxzahgfeniitejtrx}"
: "${ROTATION_ID:=20261006-canary-incident}"
: "${GH_TOKEN:?GH_TOKEN is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"

WORK="$RUNNER_TEMP/operational-shard-key-rotation"
VAULT_BEFORE="$WORK/vault-before.json"
VAULT_AFTER="$WORK/vault-after.json"
STATE="$WORK/state.json"
STATE_SECRET="/theouthaven/credential-vault/production/supabase-operational-key-rotation-${ROTATION_ID}"
KEY_NAME="theouthaven-operational-${ROTATION_ID}"
ROTATION_REASON="GitHub Actions log exposure during initial shard canary run 37394897795"
mkdir -p "$WORK"

cleanup() {
  rm -rf "$WORK"
}
trap cleanup EXIT

save_state() {
  if aws secretsmanager describe-secret --secret-id "$STATE_SECRET" >/dev/null 2>&1; then
    aws secretsmanager put-secret-value       --secret-id "$STATE_SECRET"       --secret-string "file://$STATE" >/dev/null
  else
    aws secretsmanager create-secret       --name "$STATE_SECRET"       --secret-string "file://$STATE"       --description "TheOutHaven operational shard API key rotation audit state"       --tags Key=Project,Value=TheOutHaven Key=Environment,Value=production Key=Service,Value=CredentialVault >/dev/null
  fi
}

aws secretsmanager get-secret-value   --secret-id "$SUPABASE_VAULT_SECRET"   --query SecretString --output text > "$VAULT_BEFORE"
jq -e 'type=="object"' "$VAULT_BEFORE" >/dev/null

aws secretsmanager get-secret-value \
  --secret-id "$DR_SECRET" \
  --query SecretString --output text > "$WORK/dr.json"

PRIMARY_TOKEN="$(jq -r '.managementAccessToken // empty' "$VAULT_BEFORE")"
FALLBACK_TOKEN="$(jq -r '.DR_SUPABASE_ACCESS_TOKEN // empty' "$WORK/dr.json")"
test -n "$PRIMARY_TOKEN" || test -n "$FALLBACK_TOKEN" || {
  echo "::error::No Supabase management token is available for shard-key rotation."
  exit 1
}
[ -z "$PRIMARY_TOKEN" ] || echo "::add-mask::$PRIMARY_TOKEN"
[ -z "$FALLBACK_TOKEN" ] || echo "::add-mask::$FALLBACK_TOKEN"

management_api_request() {
  local method="$1" url="$2" out="$3" body="${4:-}" token code
  for token in "$PRIMARY_TOKEN" "$FALLBACK_TOKEN"; do
    [ -n "$token" ] || continue
    if [ -n "$body" ]; then
      code="$(curl --silent --show-error \
        --output "$out" \
        --write-out '%{http_code}' \
        --request "$method" \
        -H "Authorization: Bearer $token" \
        -H 'Content-Type: application/json' \
        --data-binary "@$body" \
        "$url" || true)"
    else
      code="$(curl --silent --show-error \
        --output "$out" \
        --write-out '%{http_code}' \
        --request "$method" \
        -H "Authorization: Bearer $token" \
        "$url" || true)"
    fi
    if [ "$code" -ge 200 ] && [ "$code" -lt 300 ]; then
      MGMT_CODE="$code"
      return 0
    fi
    if [ "$code" = 401 ] || [ "$code" = 403 ]; then
      continue
    fi
    echo "::error::Supabase Management API request failed with HTTP $code."
    return 1
  done
  echo "::error::Both vault-managed Supabase management tokens lack permission for this API operation."
  return 1
}

if ! aws secretsmanager get-secret-value   --secret-id "$STATE_SECRET"   --query SecretString --output text > "$STATE" 2>/dev/null; then
  jq -n --arg id "$ROTATION_ID"     '{rotationId:$id,status:"initializing",shards:{}}' > "$STATE"
  save_state
fi
jq -e --arg id "$ROTATION_ID" '.rotationId==$id and (.shards|type=="object")' "$STATE" >/dev/null

current_key() {
  local shard="$1" field="$2" direct
  direct="$(jq -r --arg field "$field" '.[$field] // empty' "$VAULT_BEFORE")"
  if [ -n "$direct" ]; then
    printf '%s' "$direct"
    return 0
  fi
  jq -r --arg shard "$shard"     '((.operationalShardsJson // "{}" | fromjson? // {})[$shard].serviceRoleKey) // empty'     "$VAULT_BEFORE"
}

api_keys() {
  local ref="$1" out="$2"
  management_api_request GET \
    "https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true" \
    "$out"
}

verify_key() {
  local ref="$1" key="$2" label="$3" out="$WORK/${label}-probe.json" code
  code="$(curl --silent --show-error     --output "$out"     --write-out '%{http_code}'     -H "apikey: $key"     "https://${ref}.supabase.co/rest/v1/pos_checks?select=id&limit=1")"
  test "$code" = 200 || {
    echo "::error::${label} key verification failed with HTTP ${code}."
    exit 1
  }
}

prepare_one() {
  local shard="$1" ref="$2" key_field="$3" label="$4"
  local current old_id state_old new_id new_key code

  current="$(current_key "$shard" "$key_field")"
  test -n "$current" || {
    echo "::error::Current vault key is missing for ${shard}."
    exit 1
  }
  echo "::add-mask::$current"

  api_keys "$ref" "$WORK/${label}-keys.json"

  new_id="$(jq -r --arg name "$KEY_NAME"     '[.[] | select(.type=="secret" and .name==$name and (.disabled != true))][0].id // empty'     "$WORK/${label}-keys.json")"
  new_key="$(jq -r --arg name "$KEY_NAME"     '[.[] | select(.type=="secret" and .name==$name and (.disabled != true))][0].api_key // empty'     "$WORK/${label}-keys.json")"

  if [ -z "$new_id" ] || [ -z "$new_key" ]; then
    jq -n --arg name "$KEY_NAME"       '{type:"secret",name:$name,secret_jwt_template:{role:"service_role"}}'       > "$WORK/${label}-create-body.json"
    management_api_request POST \
      "https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true" \
      "$WORK/${label}-created.json" \
      "$WORK/${label}-create-body.json" || {
        echo "::error::Creating replacement key for ${shard} failed."
        exit 1
      }
    test "$MGMT_CODE" = 201 || {
      echo "::error::Creating replacement key for ${shard} returned unexpected HTTP ${MGMT_CODE}."
      exit 1
    }
    new_id="$(jq -r '.id // empty' "$WORK/${label}-created.json")"
    new_key="$(jq -r '.api_key // empty' "$WORK/${label}-created.json")"
  fi

  test -n "$new_id" && [[ "$new_key" == sb_secret_* ]] || {
    echo "::error::Replacement key response for ${shard} was invalid."
    exit 1
  }
  echo "::add-mask::$new_key"
  printf '%s' "$new_key" > "$WORK/${label}-new-key"
  verify_key "$ref" "$new_key" "${label}-new"

  state_old="$(jq -r --arg shard "$shard" '.shards[$shard].oldId // empty' "$STATE")"
  if [ -n "$state_old" ]; then
    old_id="$state_old"
  elif [ "$current" = "$new_key" ]; then
    old_id=""
  else
    old_id="$(jq -r --arg current "$current" --arg new "$new_id"       '[.[] | select(.type=="secret" and .api_key==$current and .id!=$new)][0].id // empty'       "$WORK/${label}-keys.json")"
    test -n "$old_id" || {
      echo "::error::Could not identify the exposed old key id for ${shard}; refusing rotation."
      exit 1
    }
  fi

  jq     --arg shard "$shard"     --arg ref "$ref"     --arg oldId "$old_id"     --arg newId "$new_id"     --arg name "$KEY_NAME"     '.status="keys_created" |
     .shards[$shard]={ref:$ref,oldId:$oldId,newId:$newId,name:$name}'     "$STATE" > "$WORK/state-next.json"
  mv "$WORK/state-next.json" "$STATE"
  save_state
}

prepare_one shard-01 "$SHARD01_REF" shard01SecretKey shard01
prepare_one shard-01-dr "$SHARD01_DR_REF" shard01DrSecretKey shard01dr
prepare_one shard-02 "$SHARD02_REF" shard02SecretKey shard02
prepare_one shard-02-dr "$SHARD02_DR_REF" shard02DrSecretKey shard02dr

jq '.status="keys_verified"' "$STATE" > "$WORK/state-next.json"
mv "$WORK/state-next.json" "$STATE"
save_state

S1_URL="https://$SHARD01_REF.supabase.co"
S1DR_URL="https://$SHARD01_DR_REF.supabase.co"
S2_URL="https://$SHARD02_REF.supabase.co"
S2DR_URL="https://$SHARD02_DR_REF.supabase.co"

jq   --arg s1 "$S1_URL"   --arg s1k "$(cat "$WORK/shard01-new-key")"   --arg s1dr "$S1DR_URL"   --arg s1drk "$(cat "$WORK/shard01dr-new-key")"   --arg s2 "$S2_URL"   --arg s2k "$(cat "$WORK/shard02-new-key")"   --arg s2dr "$S2DR_URL"   --arg s2drk "$(cat "$WORK/shard02dr-new-key")"   --arg rotation "$ROTATION_ID"   '(.operationalShardsJson // "{}" | fromjson? // {}) as $old |
   .shard01Url=$s1 |
   .shard01SecretKey=$s1k |
   .shard01DrUrl=$s1dr |
   .shard01DrSecretKey=$s1drk |
   .shard02Url=$s2 |
   .shard02SecretKey=$s2k |
   .shard02DrUrl=$s2dr |
   .shard02DrSecretKey=$s2drk |
   .operationalShardsJson=({
     "shard-01": {url:$s1,serviceRoleKey:$s1k,readEnabled:($old["shard-01"].readEnabled // true),writeEnabled:($old["shard-01"].writeEnabled // true)},
     "shard-01-dr": {url:$s1dr,serviceRoleKey:$s1drk,readEnabled:($old["shard-01-dr"].readEnabled // true),writeEnabled:($old["shard-01-dr"].writeEnabled // true)},
     "shard-02": {url:$s2,serviceRoleKey:$s2k,readEnabled:($old["shard-02"].readEnabled // true),writeEnabled:($old["shard-02"].writeEnabled // true)},
     "shard-02-dr": {url:$s2dr,serviceRoleKey:$s2drk,readEnabled:($old["shard-02-dr"].readEnabled // true),writeEnabled:($old["shard-02-dr"].writeEnabled // true)}
   } | tojson) |
   .operationalShardKeyRotation={
     incident:"github-actions-log-37394897795",
     rotationId:$rotation,
     rotatedAt:(now | todateiso8601)
   }'   "$VAULT_BEFORE" > "$WORK/vault-next.json"

aws secretsmanager put-secret-value   --secret-id "$SUPABASE_VAULT_SECRET"   --secret-string "file://$WORK/vault-next.json" >/dev/null

aws secretsmanager get-secret-value   --secret-id "$SUPABASE_VAULT_SECRET"   --query SecretString --output text > "$VAULT_AFTER"

jq -e '
  (.shard01SecretKey | startswith("sb_secret_")) and
  (.shard01DrSecretKey | startswith("sb_secret_")) and
  (.shard02SecretKey | startswith("sb_secret_")) and
  (.shard02DrSecretKey | startswith("sb_secret_")) and
  ((.operationalShardsJson | fromjson)["shard-01"].serviceRoleKey == .shard01SecretKey) and
  ((.operationalShardsJson | fromjson)["shard-01-dr"].serviceRoleKey == .shard01DrSecretKey) and
  ((.operationalShardsJson | fromjson)["shard-02"].serviceRoleKey == .shard02SecretKey) and
  ((.operationalShardsJson | fromjson)["shard-02-dr"].serviceRoleKey == .shard02DrSecretKey)
' "$VAULT_AFTER" >/dev/null

probe_persisted() {
  local ref="$1" field="$2" label="$3" key
  key="$(jq -r --arg field "$field" '.[$field] // empty' "$VAULT_AFTER")"
  [[ "$key" == sb_secret_* ]] || {
    echo "::error::Persisted ${label} key is missing."
    exit 1
  }
  echo "::add-mask::$key"
  verify_key "$ref" "$key" "${label}-persisted"
}
probe_persisted "$SHARD01_REF" shard01SecretKey shard01
probe_persisted "$SHARD01_DR_REF" shard01DrSecretKey shard01dr
probe_persisted "$SHARD02_REF" shard02SecretKey shard02
probe_persisted "$SHARD02_DR_REF" shard02DrSecretKey shard02dr

jq '.status="vault_updated"' "$STATE" > "$WORK/state-next.json"
mv "$WORK/state-next.json" "$STATE"
save_state

DISPATCH_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
curl --fail --silent --show-error   --request POST   -H "Authorization: Bearer $GH_TOKEN"   -H "Accept: application/vnd.github+json"   -H "X-GitHub-Api-Version: 2022-11-28"   -H 'Content-Type: application/json'   --data '{"ref":"main","inputs":{"environment":"production"}}'   "https://api.github.com/repos/$GITHUB_REPOSITORY/actions/workflows/aws-credential-vault-runtime-sync.yml/dispatches"

RUN_ID=""
for _ in $(seq 1 60); do
  curl --fail --silent --show-error     -H "Authorization: Bearer $GH_TOKEN"     -H "Accept: application/vnd.github+json"     -H "X-GitHub-Api-Version: 2022-11-28"     "https://api.github.com/repos/$GITHUB_REPOSITORY/actions/runs?event=workflow_dispatch&branch=main&per_page=20"     > "$WORK/runtime-sync-runs.json"
  RUN_ID="$(jq -r --arg when "$DISPATCH_AT"     '[.workflow_runs[] | select(.name=="AWS Credential Vault runtime sync" and .created_at >= $when)][0].id // empty'     "$WORK/runtime-sync-runs.json")"
  [ -n "$RUN_ID" ] && break
  sleep 5
done
test -n "$RUN_ID" || {
  echo "::error::supabase_shard_runtime_sync_failed: dispatched runtime sync run was not found."
  exit 1
}

for _ in $(seq 1 120); do
  curl --fail --silent --show-error     -H "Authorization: Bearer $GH_TOKEN"     -H "Accept: application/vnd.github+json"     -H "X-GitHub-Api-Version: 2022-11-28"     "https://api.github.com/repos/$GITHUB_REPOSITORY/actions/runs/$RUN_ID"     > "$WORK/runtime-sync.json"
  STATUS="$(jq -r '.status' "$WORK/runtime-sync.json")"
  CONCLUSION="$(jq -r '.conclusion // empty' "$WORK/runtime-sync.json")"
  if [ "$STATUS" = completed ]; then
    test "$CONCLUSION" = success || {
      echo "::error::supabase_shard_runtime_sync_failed: runtime sync concluded ${CONCLUSION}."
      exit 1
    }
    break
  fi
  sleep 10
done

test "$(jq -r '.status' "$WORK/runtime-sync.json")" = completed || {
  echo "::error::supabase_shard_runtime_sync_failed: runtime sync timed out."
  exit 1
}

aws secretsmanager get-secret-value   --secret-id "$RUNTIME_SECRET"   --query SecretString --output text > "$WORK/runtime-after.json"

python3 - "$VAULT_AFTER" "$WORK/runtime-after.json" <<'PY'
import json
import sys
vault = json.load(open(sys.argv[1]))
runtime = json.load(open(sys.argv[2]))
vault_map = json.loads(vault["operationalShardsJson"])
runtime_map = json.loads(runtime["OPERATIONAL_SHARDS_JSON"])
assert vault_map == runtime_map
assert set(vault_map) == {"shard-01", "shard-01-dr", "shard-02", "shard-02-dr"}
PY

jq '.status="runtime_synced"' "$STATE" > "$WORK/state-next.json"
mv "$WORK/state-next.json" "$STATE"
save_state

revoke_one() {
  local shard="$1" ref="$2" label="$3" old_id new_id encoded_reason
  old_id="$(jq -r --arg shard "$shard" '.shards[$shard].oldId // empty' "$STATE")"
  new_id="$(jq -r --arg shard "$shard" '.shards[$shard].newId // empty' "$STATE")"
  [ -n "$old_id" ] || return 0
  [ "$old_id" != "$new_id" ] || return 0

  management_api_request GET \
    "https://api.supabase.com/v1/projects/${ref}/api-keys" \
    "$WORK/${label}-current-keys.json"

  if jq -e --arg id "$old_id" '.[] | select(.id==$id)' "$WORK/${label}-current-keys.json" >/dev/null; then
    encoded_reason="$(jq -rn --arg x "$ROTATION_REASON" '$x|@uri')"
    management_api_request DELETE \
      "https://api.supabase.com/v1/projects/${ref}/api-keys/${old_id}?was_compromised=true&reason=${encoded_reason}" \
      "$WORK/${label}-revoke.json"
  fi

  management_api_request GET \
    "https://api.supabase.com/v1/projects/${ref}/api-keys" \
    "$WORK/${label}-post-revoke.json"
  if jq -e --arg id "$old_id" '.[] | select(.id==$id)' "$WORK/${label}-post-revoke.json" >/dev/null; then
    echo "::error::Compromised old key id for ${shard} remains active after revocation."
    exit 1
  fi
}

revoke_one shard-01 "$SHARD01_REF" shard01
revoke_one shard-01-dr "$SHARD01_DR_REF" shard01dr
revoke_one shard-02 "$SHARD02_REF" shard02
revoke_one shard-02-dr "$SHARD02_DR_REF" shard02dr

jq '.status="old_keys_revoked"' "$STATE" > "$WORK/state-next.json"
mv "$WORK/state-next.json" "$STATE"
save_state

probe_persisted "$SHARD01_REF" shard01SecretKey shard01-final
probe_persisted "$SHARD01_DR_REF" shard01DrSecretKey shard01dr-final
probe_persisted "$SHARD02_REF" shard02SecretKey shard02-final
probe_persisted "$SHARD02_DR_REF" shard02DrSecretKey shard02dr-final

{
  echo '### Operational shard secret rotation'
  echo "- Rotation id: `$ROTATION_ID`"
  echo '- Four replacement Supabase secret keys created/reused and verified'
  echo '- Admin Credential Vault dedicated shard fields updated'
  echo '- operationalShardsJson regenerated and persisted'
  echo '- Runtime OPERATIONAL_SHARDS_JSON synchronized and verified'
  echo '- Four previously exposed key ids revoked as compromised'
  echo '- Final four-shard API verification passed'
} >> "$GITHUB_STEP_SUMMARY"
