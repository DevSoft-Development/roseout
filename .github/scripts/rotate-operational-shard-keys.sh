#!/usr/bin/env bash
set -euo pipefail

: "${AWS_REGION:=us-east-1}"
: "${AWS_ACCOUNT_ID:=742020474738}"
: "${SUPABASE_VAULT_SECRET:=/theouthaven/credential-vault/production/supabase}"
: "${DR_SECRET:=/theouthaven/production/dr-reconciler/env}"
: "${SHARD01_REF:=lyeruuzsnceaxrmdafxb}"
: "${SHARD01_DR_REF:=vcdnwrsuvhtlvxqbkamg}"
: "${SHARD02_REF:=lpcrikaixcfbqaikevlg}"
: "${SHARD02_DR_REF:=bjhcxzahgfeniitejtrx}"

VAULT="$RUNNER_TEMP/supabase-vault.json"
DR="$RUNNER_TEMP/dr.json"
ROTATION_NAME="operational-shard-runtime-${GITHUB_RUN_ID}"
ROTATION_DESCRIPTION="Rotated after compromised GitHub Actions log 37394897795 on 2026-10-06"

cleanup() {
  rm -f "$RUNNER_TEMP"/supabase-vault*.json         "$RUNNER_TEMP"/dr.json         "$RUNNER_TEMP"/shard-*.json         "$RUNNER_TEMP"/shard-*-old         "$RUNNER_TEMP"/shard-*-old-id         "$RUNNER_TEMP"/shard-*-new         "$RUNNER_TEMP"/shard-*-new-id         "$RUNNER_TEMP"/shard-*-probe.json         "$RUNNER_TEMP"/rotation-body.json
}
trap cleanup EXIT

aws secretsmanager get-secret-value   --secret-id "$SUPABASE_VAULT_SECRET"   --query SecretString   --output text > "$VAULT"

aws secretsmanager get-secret-value   --secret-id "$DR_SECRET"   --query SecretString   --output text > "$DR"

TOKEN="$(jq -r '.DR_SUPABASE_ACCESS_TOKEN // empty' "$DR")"
if [ -z "$TOKEN" ]; then
  TOKEN="$(jq -r '.managementAccessToken // empty' "$VAULT")"
fi
test -n "$TOKEN" || {
  echo "::error::Supabase management token is unavailable."
  exit 1
}
echo "::add-mask::$TOKEN"

SHARDS="$(jq -r '.operationalShardsJson // empty' "$VAULT")"
test -n "$SHARDS" || {
  echo "::error::operationalShardsJson is missing from the AWS credential vault."
  exit 1
}

mask_current_keys() {
  printf '%s' "$SHARDS" | jq -r 'to_entries[] | (.value.serviceRoleKey // .value.secretKey // empty)' |
  while IFS= read -r key; do
    [ -n "$key" ] && echo "::add-mask::$key"
  done
}
mask_current_keys

current_key() {
  local logical="$1"
  printf '%s' "$SHARDS" | jq -r --arg logical "$logical" '.[$logical].serviceRoleKey // .[$logical].secretKey // empty'
}

api_keys() {
  local ref="$1" out="$2"
  curl --fail --silent --show-error     -H "Authorization: Bearer $TOKEN"     "https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true" > "$out"
}

verify_key() {
  local ref="$1" key="$2" label="$3" out="$RUNNER_TEMP/${label}-probe.json" code
  code="$(curl --silent --show-error --output "$out" --write-out '%{http_code}'     -H "apikey: $key"     "https://${ref}.supabase.co/rest/v1/pos_checks?select=id&limit=1")"
  test "$code" = 200 || {
    echo "::error::${label} key verification failed with HTTP ${code}."
    exit 1
  }
}

prepare_one() {
  local logical="$1" ref="$2" label="$3"
  local old old_id new new_id code

  old="$(current_key "$logical")"
  test -n "$old" || {
    echo "::error::Current vault key is missing for ${logical}."
    exit 1
  }
  echo "::add-mask::$old"
  printf '%s' "$old" > "$RUNNER_TEMP/${label}-old"

  api_keys "$ref" "$RUNNER_TEMP/${label}-keys.json"
  old_id="$(jq -r --arg old "$old" '[.[] | select(.type=="secret" and .api_key==$old)][0].id // empty' "$RUNNER_TEMP/${label}-keys.json")"
  test -n "$old_id" || {
    echo "::error::The current vault key for ${logical} was not found among active Supabase secret keys."
    exit 1
  }
  printf '%s' "$old_id" > "$RUNNER_TEMP/${label}-old-id"

  new="$(jq -r --arg name "$ROTATION_NAME" '[.[] | select(.type=="secret" and .name==$name and (.disabled != true))][0].api_key // empty' "$RUNNER_TEMP/${label}-keys.json")"
  new_id="$(jq -r --arg name "$ROTATION_NAME" '[.[] | select(.type=="secret" and .name==$name and (.disabled != true))][0].id // empty' "$RUNNER_TEMP/${label}-keys.json")"

  if [ -z "$new" ]; then
    jq -n       --arg type "secret"       --arg name "$ROTATION_NAME"       --arg description "$ROTATION_DESCRIPTION"       '{type:$type,name:$name,description:$description}' > "$RUNNER_TEMP/rotation-body.json"

    code="$(curl --silent --show-error       --output "$RUNNER_TEMP/${label}-create.json"       --write-out '%{http_code}'       --request POST       -H "Authorization: Bearer $TOKEN"       -H 'Content-Type: application/json'       --data-binary "@$RUNNER_TEMP/rotation-body.json"       "https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true")"
    test "$code" = 201 || {
      echo "::error::Failed to create replacement secret key for ${logical}: HTTP ${code}."
      exit 1
    }
    new="$(jq -r '.api_key // empty' "$RUNNER_TEMP/${label}-create.json")"
    new_id="$(jq -r '.id // empty' "$RUNNER_TEMP/${label}-create.json")"
  fi

  test -n "$new" && test -n "$new_id" || {
    echo "::error::Replacement key material is incomplete for ${logical}."
    exit 1
  }
  test "$new" != "$old" || {
    echo "::error::Replacement key unexpectedly matches the compromised key for ${logical}."
    exit 1
  }

  echo "::add-mask::$new"
  printf '%s' "$new" > "$RUNNER_TEMP/${label}-new"
  printf '%s' "$new_id" > "$RUNNER_TEMP/${label}-new-id"
  verify_key "$ref" "$new" "$label-new"
}

prepare_one "shard-01" "$SHARD01_REF" "shard-01"
prepare_one "shard-01-dr" "$SHARD01_DR_REF" "shard-01-dr"
prepare_one "shard-02" "$SHARD02_REF" "shard-02"
prepare_one "shard-02-dr" "$SHARD02_DR_REF" "shard-02-dr"

jq -n   --arg s1 "https://${SHARD01_REF}.supabase.co"   --arg s1k "$(cat "$RUNNER_TEMP/shard-01-new")"   --arg s1dr "https://${SHARD01_DR_REF}.supabase.co"   --arg s1drk "$(cat "$RUNNER_TEMP/shard-01-dr-new")"   --arg s2 "https://${SHARD02_REF}.supabase.co"   --arg s2k "$(cat "$RUNNER_TEMP/shard-02-new")"   --arg s2dr "https://${SHARD02_DR_REF}.supabase.co"   --arg s2drk "$(cat "$RUNNER_TEMP/shard-02-dr-new")"   '{
    "shard-01": {url:$s1,serviceRoleKey:$s1k,readEnabled:true,writeEnabled:true},
    "shard-01-dr": {url:$s1dr,serviceRoleKey:$s1drk,readEnabled:true,writeEnabled:true},
    "shard-02": {url:$s2,serviceRoleKey:$s2k,readEnabled:true,writeEnabled:true},
    "shard-02-dr": {url:$s2dr,serviceRoleKey:$s2drk,readEnabled:true,writeEnabled:true}
  }' > "$RUNNER_TEMP/operational-shards-next.json"

NEXT_SHARDS="$(cat "$RUNNER_TEMP/operational-shards-next.json")"
jq --arg shards "$NEXT_SHARDS"   '.operationalShardsJson=$shards |
   .operationalShardKeyRotation={
      incident:"github-actions-log-37394897795",
      rotatedAt:(now | todateiso8601),
      runId:env.GITHUB_RUN_ID
   }'   "$VAULT" > "$RUNNER_TEMP/supabase-vault-next.json"

aws secretsmanager put-secret-value   --secret-id "$SUPABASE_VAULT_SECRET"   --secret-string "file://$RUNNER_TEMP/supabase-vault-next.json" >/dev/null

aws secretsmanager get-secret-value   --secret-id "$SUPABASE_VAULT_SECRET"   --query SecretString   --output text > "$RUNNER_TEMP/supabase-vault-after.json"

PERSISTED_SHARDS="$(jq -r '.operationalShardsJson // empty' "$RUNNER_TEMP/supabase-vault-after.json")"
test -n "$PERSISTED_SHARDS" || {
  echo "::error::Vault verification failed: operationalShardsJson is missing."
  exit 1
}

verify_persisted() {
  local logical="$1" ref="$2" label="$3" expected actual
  expected="$(cat "$RUNNER_TEMP/${label}-new")"
  actual="$(printf '%s' "$PERSISTED_SHARDS" | jq -r --arg logical "$logical" '.[$logical].serviceRoleKey // empty')"
  test -n "$actual" && test "$actual" = "$expected" || {
    echo "::error::Persisted vault key mismatch for ${logical}."
    exit 1
  }
  echo "::add-mask::$actual"
  verify_key "$ref" "$actual" "$label-persisted"
}

verify_persisted "shard-01" "$SHARD01_REF" "shard-01"
verify_persisted "shard-01-dr" "$SHARD01_DR_REF" "shard-01-dr"
verify_persisted "shard-02" "$SHARD02_REF" "shard-02"
verify_persisted "shard-02-dr" "$SHARD02_DR_REF" "shard-02-dr"

revoke_old() {
  local ref="$1" label="$2" old old_id encoded_reason code old_code
  old="$(cat "$RUNNER_TEMP/${label}-old")"
  old_id="$(cat "$RUNNER_TEMP/${label}-old-id")"
  encoded_reason="$(jq -rn --arg x "$ROTATION_DESCRIPTION" '$x|@uri')"

  code="$(curl --silent --show-error     --output "$RUNNER_TEMP/${label}-delete.json"     --write-out '%{http_code}'     --request DELETE     -H "Authorization: Bearer $TOKEN"     "https://api.supabase.com/v1/projects/${ref}/api-keys/${old_id}?was_compromised=true&reason=${encoded_reason}")"
  test "$code" = 200 || {
    echo "::error::Failed to revoke compromised key for ${label}: HTTP ${code}."
    exit 1
  }

  old_code="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}'     -H "apikey: $old"     "https://${ref}.supabase.co/rest/v1/pos_checks?select=id&limit=1" || true)"
  if [ "$old_code" -ge 200 ] && [ "$old_code" -lt 300 ]; then
    echo "::error::Compromised key for ${label} is still accepted after revocation."
    exit 1
  fi
}

revoke_old "$SHARD01_REF" "shard-01"
revoke_old "$SHARD01_DR_REF" "shard-01-dr"
revoke_old "$SHARD02_REF" "shard-02"
revoke_old "$SHARD02_DR_REF" "shard-02-dr"

verify_persisted "shard-01" "$SHARD01_REF" "shard-01"
verify_persisted "shard-01-dr" "$SHARD01_DR_REF" "shard-01-dr"
verify_persisted "shard-02" "$SHARD02_REF" "shard-02"
verify_persisted "shard-02-dr" "$SHARD02_DR_REF" "shard-02-dr"

{
  echo "### Operational shard secret rotation"
  echo "- Four replacement Supabase secret keys created and verified"
  echo "- AWS credential vault operationalShardsJson atomically switched"
  echo "- Persisted vault credentials verified against all four shard APIs"
  echo "- Four compromised secret keys revoked as compromised"
  echo "- Revoked keys confirmed unusable"
} >> "$GITHUB_STEP_SUMMARY"
