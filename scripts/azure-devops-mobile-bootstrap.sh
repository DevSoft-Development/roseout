#!/usr/bin/env bash
set -euo pipefail

MOBILE_SIGNING_SECRET_ID="${MOBILE_SIGNING_SECRET_ID:-/theouthaven/credential-vault/production/mobile}"
WORK="${RUNNER_TEMP:-/tmp}/theouthaven-mobile-bootstrap-${GITHUB_RUN_ID:-$$}"
mkdir -p "$WORK"
chmod 700 "$WORK"

cleanup() {
  rm -rf "$WORK"
}
trap cleanup EXIT

for tool in aws jq curl python3 base64; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Required tool is missing: $tool" >&2; exit 1; }
done

aws secretsmanager get-secret-value   --secret-id "$MOBILE_SIGNING_SECRET_ID"   --query SecretString   --output text > "$WORK/mobile.json"

jq -e '
  type == "object" and
  (.azureDevOpsOrg | type == "string" and length > 0) and
  (.azureDevOpsProject | type == "string" and length > 0) and
  (.azureDevOpsPat | type == "string" and length > 0) and
  (.iosCertificateP12Base64 | type == "string" and length > 0) and
  (.iosCertificatePassword | type == "string" and length > 0) and
  (.iosProvisioningProfileBase64 | type == "string" and length > 0) and
  (.iosTeamId | type == "string" and length > 0) and
  (.appStoreConnectKeyId | type == "string" and length > 0) and
  (.appStoreConnectIssuerId | type == "string" and length > 0) and
  (.appStoreConnectPrivateKey | type == "string" and contains("BEGIN PRIVATE KEY")) and
  (.appStoreConnectAppId | type == "string" and length > 0) and
  (.androidKeystoreBase64 | type == "string" and length > 0) and
  (.androidKeystorePassword | type == "string" and length > 0) and
  (.androidKeyAlias | type == "string" and length > 0) and
  (.androidKeyPassword | type == "string" and length > 0) and
  (.googlePlayServiceAccountJson | type == "string" and length > 0)
' "$WORK/mobile.json" >/dev/null || {
  echo "Mobile Release Signing credential in the Admin Credential Vault is incomplete." >&2
  exit 1
}

AZDO_ORG="$(jq -r '.azureDevOpsOrg' "$WORK/mobile.json")"
AZDO_PROJECT="$(jq -r '.azureDevOpsProject' "$WORK/mobile.json")"
AZDO_PAT="$(jq -r '.azureDevOpsPat' "$WORK/mobile.json")"
AZDO_GITHUB_SERVICE_CONNECTION_ID="$(jq -r '.azureDevOpsGithubServiceConnectionId // empty' "$WORK/mobile.json")"
IOS_CERTIFICATE_PASSWORD="$(jq -r '.iosCertificatePassword' "$WORK/mobile.json")"
IOS_TEAM_ID="$(jq -r '.iosTeamId' "$WORK/mobile.json")"
APP_STORE_CONNECT_KEY_ID="$(jq -r '.appStoreConnectKeyId' "$WORK/mobile.json")"
APP_STORE_CONNECT_ISSUER_ID="$(jq -r '.appStoreConnectIssuerId' "$WORK/mobile.json")"
APP_STORE_CONNECT_APP_ID="$(jq -r '.appStoreConnectAppId' "$WORK/mobile.json")"
ANDROID_KEYSTORE_PASSWORD="$(jq -r '.androidKeystorePassword' "$WORK/mobile.json")"
ANDROID_KEY_ALIAS="$(jq -r '.androidKeyAlias' "$WORK/mobile.json")"
ANDROID_KEY_PASSWORD="$(jq -r '.androidKeyPassword' "$WORK/mobile.json")"

for value in   "$AZDO_PAT"   "$IOS_CERTIFICATE_PASSWORD"   "$ANDROID_KEYSTORE_PASSWORD"   "$ANDROID_KEY_PASSWORD"; do
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::add-mask::$value"; fi
done

jq -r '.iosCertificateP12Base64' "$WORK/mobile.json" | base64 --decode > "$WORK/theouthaven-ios-distribution.p12"
jq -r '.iosProvisioningProfileBase64' "$WORK/mobile.json" | base64 --decode > "$WORK/theouthaven-appstore.mobileprovision"
jq -r '.appStoreConnectPrivateKey' "$WORK/mobile.json" > "$WORK/theouthaven-appstore-connect.p8"
jq -r '.androidKeystoreBase64' "$WORK/mobile.json" | base64 --decode > "$WORK/theouthaven-android-upload.jks"
jq -r '.googlePlayServiceAccountJson' "$WORK/mobile.json" > "$WORK/theouthaven-google-play-service-account.json"
chmod 600 "$WORK"/*

jq -e '.type == "service_account" and (.client_email | length > 0) and (.private_key | contains("BEGIN PRIVATE KEY"))'   "$WORK/theouthaven-google-play-service-account.json" >/dev/null

API_ROOT="https://dev.azure.com/$AZDO_ORG"
AUTH_HEADER="Authorization: Basic $(printf ':%s' "$AZDO_PAT" | base64 | tr -d '\n')"
JSON_HEADER="Content-Type: application/json"

urlencode() {
  python3 - "$1" <<'PY'
import sys
from urllib.parse import quote
print(quote(sys.argv[1], safe=''))
PY
}

api() {
  curl --fail --silent --show-error -H "$AUTH_HEADER" "$@"
}

PROJECT_JSON="$(api "$API_ROOT/_apis/projects/$(urlencode "$AZDO_PROJECT")?api-version=7.1")"
PROJECT_ID="$(printf '%s' "$PROJECT_JSON" | jq -r '.id // empty')"
PROJECT_NAME="$(printf '%s' "$PROJECT_JSON" | jq -r '.name // empty')"
test -n "$PROJECT_ID" && test -n "$PROJECT_NAME"

replace_secure_file() {
  local source="$1"
  local name="$2"
  local encoded
  encoded="$(urlencode "$name")"

  local existing
  existing="$(api "$API_ROOT/$PROJECT_ID/_apis/distributedtask/securefiles?namePattern=$encoded&api-version=7.2-preview.1")"
  while IFS= read -r secure_file_id; do
    [ -n "$secure_file_id" ] || continue
    api -X DELETE "$API_ROOT/$PROJECT_ID/_apis/distributedtask/securefiles/$secure_file_id?api-version=7.2-preview.1" >/dev/null
  done < <(printf '%s' "$existing" | jq -r --arg name "$name" '.value[]? | select(.name == $name) | .id')

  api     -X POST     -H "Content-Type: application/octet-stream"     --data-binary "@$source"     "$API_ROOT/$PROJECT_ID/_apis/distributedtask/securefiles?name=$encoded&authorizePipelines=true&api-version=7.2-preview.1"     >/dev/null

  echo "Azure DevOps secure file synchronized: $name"
}

IOS_CERTIFICATE_SECURE_FILE="theouthaven-ios-distribution.p12"
IOS_PROFILE_SECURE_FILE="theouthaven-appstore.mobileprovision"
APP_STORE_CONNECT_KEY_SECURE_FILE="theouthaven-appstore-connect.p8"
ANDROID_KEYSTORE_SECURE_FILE="theouthaven-android-upload.jks"
GOOGLE_PLAY_SERVICE_ACCOUNT_SECURE_FILE="theouthaven-google-play-service-account.json"

replace_secure_file "$WORK/$IOS_CERTIFICATE_SECURE_FILE" "$IOS_CERTIFICATE_SECURE_FILE"
replace_secure_file "$WORK/$IOS_PROFILE_SECURE_FILE" "$IOS_PROFILE_SECURE_FILE"
replace_secure_file "$WORK/$APP_STORE_CONNECT_KEY_SECURE_FILE" "$APP_STORE_CONNECT_KEY_SECURE_FILE"
replace_secure_file "$WORK/$ANDROID_KEYSTORE_SECURE_FILE" "$ANDROID_KEYSTORE_SECURE_FILE"
replace_secure_file "$WORK/$GOOGLE_PLAY_SERVICE_ACCOUNT_SECURE_FILE" "$GOOGLE_PLAY_SERVICE_ACCOUNT_SECURE_FILE"

GROUP_NAME="theouthaven-mobile-production"
VARIABLE_GROUPS_JSON="$(api "$API_ROOT/$PROJECT_ID/_apis/distributedtask/variablegroups?groupName=$(urlencode "$GROUP_NAME")&api-version=7.1")"
GROUP_ID="$(printf '%s' "$VARIABLE_GROUPS_JSON" | jq -r '.value[0].id // empty')"

GROUP_BODY="$(
  jq -n     --arg projectId "$PROJECT_ID"     --arg projectName "$PROJECT_NAME"     --arg name "$GROUP_NAME"     --arg iosCert "$IOS_CERTIFICATE_SECURE_FILE"     --arg iosProfile "$IOS_PROFILE_SECURE_FILE"     --arg appStoreKey "$APP_STORE_CONNECT_KEY_SECURE_FILE"     --arg androidKeystore "$ANDROID_KEYSTORE_SECURE_FILE"     --arg googlePlay "$GOOGLE_PLAY_SERVICE_ACCOUNT_SECURE_FILE"     --arg iosCertPassword "$IOS_CERTIFICATE_PASSWORD"     --arg iosTeam "$IOS_TEAM_ID"     --arg appStoreKeyId "$APP_STORE_CONNECT_KEY_ID"     --arg appStoreIssuer "$APP_STORE_CONNECT_ISSUER_ID"     --arg appStoreAppId "$APP_STORE_CONNECT_APP_ID"     --arg androidStorePassword "$ANDROID_KEYSTORE_PASSWORD"     --arg androidAlias "$ANDROID_KEY_ALIAS"     --arg androidKeyPassword "$ANDROID_KEY_PASSWORD"     '{
      name: $name,
      description: "TheOutHaven production mobile signing and store submission configuration. Source of truth: Admin Credential Vault.",
      type: "Vsts",
      variableGroupProjectReferences: [{
        projectReference: { id: $projectId, name: $projectName },
        name: $name,
        description: "TheOutHaven production mobile signing and store submission configuration."
      }],
      variables: {
        IOS_CERTIFICATE_SECURE_FILE: { value: $iosCert },
        IOS_PROFILE_SECURE_FILE: { value: $iosProfile },
        APP_STORE_CONNECT_KEY_SECURE_FILE: { value: $appStoreKey },
        ANDROID_KEYSTORE_SECURE_FILE: { value: $androidKeystore },
        GOOGLE_PLAY_SERVICE_ACCOUNT_SECURE_FILE: { value: $googlePlay },
        IOS_CERTIFICATE_PASSWORD: { value: $iosCertPassword, isSecret: true },
        IOS_TEAM_ID: { value: $iosTeam },
        APP_STORE_CONNECT_KEY_ID: { value: $appStoreKeyId },
        APP_STORE_CONNECT_ISSUER_ID: { value: $appStoreIssuer },
        APP_STORE_CONNECT_APP_ID: { value: $appStoreAppId },
        ANDROID_KEYSTORE_PASSWORD: { value: $androidStorePassword, isSecret: true },
        ANDROID_KEY_ALIAS: { value: $androidAlias },
        ANDROID_KEY_PASSWORD: { value: $androidKeyPassword, isSecret: true }
      }
    }'
)"

if [ -n "$GROUP_ID" ]; then
  api -X PUT -H "$JSON_HEADER" --data "$GROUP_BODY"     "$API_ROOT/_apis/distributedtask/variablegroups/$GROUP_ID?api-version=7.1" >/dev/null
  echo "Updated Azure DevOps variable group: $GROUP_NAME"
else
  CREATED="$(
    api -X POST -H "$JSON_HEADER" --data "$GROUP_BODY"       "$API_ROOT/_apis/distributedtask/variablegroups?api-version=7.1"
  )"
  GROUP_ID="$(printf '%s' "$CREATED" | jq -r '.id // empty')"
  test -n "$GROUP_ID"
  echo "Created Azure DevOps variable group: $GROUP_NAME"
fi

if [ -z "$AZDO_GITHUB_SERVICE_CONNECTION_ID" ]; then
  SERVICE_ENDPOINT_URL="$API_ROOT/$PROJECT_ID/_apis/serviceendpoint/endpoints?api-version=7.1"
  SERVICE_ENDPOINT_BODY="$WORK/service-endpoints-response.json"
  SERVICE_ENDPOINT_STATUS="$(curl --silent --show-error -H "$AUTH_HEADER" -o "$SERVICE_ENDPOINT_BODY" -w '%{http_code}' "$SERVICE_ENDPOINT_URL")"
  if [ "$SERVICE_ENDPOINT_STATUS" -lt 200 ] || [ "$SERVICE_ENDPOINT_STATUS" -ge 300 ]; then
    echo "Azure DevOps service-endpoint lookup failed with HTTP $SERVICE_ENDPOINT_STATUS." >&2
    jq -c '{message, typeName, errorCode, eventId}' "$SERVICE_ENDPOINT_BODY" 2>/dev/null >&2 || cat "$SERVICE_ENDPOINT_BODY" >&2
    exit 1
  fi
  CONNECTIONS="$(cat "$SERVICE_ENDPOINT_BODY")"
  GITHUB_CONNECTIONS="$(printf '%s' "$CONNECTIONS" | jq '{value: [.value[]? | select((.type // "" | ascii_downcase) == "github")]}')"
  CONNECTION_COUNT="$(printf '%s' "$GITHUB_CONNECTIONS" | jq '.value | length')"
  if [ "$CONNECTION_COUNT" -eq 1 ]; then
    AZDO_GITHUB_SERVICE_CONNECTION_ID="$(printf '%s' "$GITHUB_CONNECTIONS" | jq -r '.value[0].id')"
  elif [ "$CONNECTION_COUNT" -eq 0 ]; then
    echo "No Azure DevOps GitHub service connection exists for project $PROJECT_NAME." >&2
    exit 1
  else
    echo "Multiple Azure DevOps GitHub service connections exist. Save azureDevOpsGithubServiceConnectionId in the Mobile Release Signing vault provider." >&2
    exit 1
  fi
fi

PIPELINE_NAME="TheOutHaven Mobile Production"
PIPELINE_FOLDER="\\TheOutHaven"
PIPELINE_YAML="azure-pipelines-mobile.yml"
GITHUB_REPOSITORY="DevSoft-Development/roseout"
GITHUB_REPOSITORY_URL="https://github.com/DevSoft-Development/roseout"
GITHUB_API_URL="https://api.github.com/repos/DevSoft-Development/roseout"

QUEUES_URL="$API_ROOT/$PROJECT_ID/_apis/distributedtask/queues?api-version=7.1"
QUEUES_BODY="$WORK/agent-queues-response.json"
QUEUES_STATUS="$(curl --silent --show-error -H "$AUTH_HEADER" -o "$QUEUES_BODY" -w '%{http_code}' "$QUEUES_URL")"
if [ "$QUEUES_STATUS" -lt 200 ] || [ "$QUEUES_STATUS" -ge 300 ]; then
  echo "Azure DevOps agent-queue lookup failed with HTTP $QUEUES_STATUS." >&2
  jq -c '{message, typeName, errorCode, eventId}' "$QUEUES_BODY" 2>/dev/null >&2 || cat "$QUEUES_BODY" >&2
  exit 1
fi

AZURE_PIPELINES_QUEUE_ID="$(jq -r '
  [.value[]? | select((.name == "Azure Pipelines") or (.pool.name == "Azure Pipelines") or (.pool.isHosted == true))]
  | sort_by(if .name == "Azure Pipelines" then 0 else 1 end)
  | .[0].id // empty
' "$QUEUES_BODY")"
if [ -z "$AZURE_PIPELINES_QUEUE_ID" ]; then
  echo "No Microsoft-hosted Azure Pipelines queue is connected to project $PROJECT_NAME." >&2
  exit 1
fi
echo "Azure DevOps hosted queue selected: $AZURE_PIPELINES_QUEUE_ID"

DEFINITION_LIST_URL="$API_ROOT/$PROJECT_ID/_apis/build/definitions?name=$(urlencode "$PIPELINE_NAME")&path=$(urlencode "$PIPELINE_FOLDER")&api-version=7.1"
DEFINITION_LIST_BODY="$WORK/build-definitions-response.json"
DEFINITION_LIST_STATUS="$(curl --silent --show-error -H "$AUTH_HEADER" -o "$DEFINITION_LIST_BODY" -w '%{http_code}' "$DEFINITION_LIST_URL")"
if [ "$DEFINITION_LIST_STATUS" -lt 200 ] || [ "$DEFINITION_LIST_STATUS" -ge 300 ]; then
  echo "Azure DevOps build-definition list failed with HTTP $DEFINITION_LIST_STATUS." >&2
  jq -c '{message, typeName, errorCode, eventId}' "$DEFINITION_LIST_BODY" 2>/dev/null >&2 || cat "$DEFINITION_LIST_BODY" >&2
  exit 1
fi
PIPELINE_ID="$(jq -r --arg name "$PIPELINE_NAME" '.value[]? | select(.name == $name) | .id' "$DEFINITION_LIST_BODY" | head -1)"

if [ -z "$PIPELINE_ID" ]; then
  PIPELINE_BODY="$(
    jq -n \
      --arg name "$PIPELINE_NAME" \
      --arg path "$PIPELINE_FOLDER" \
      --arg yaml "$PIPELINE_YAML" \
      --arg repo "$GITHUB_REPOSITORY" \
      --arg repoUrl "$GITHUB_REPOSITORY_URL" \
      --arg apiUrl "$GITHUB_API_URL" \
      --arg connectionId "$AZDO_GITHUB_SERVICE_CONNECTION_ID" \
      --argjson queueId "$AZURE_PIPELINES_QUEUE_ID" \
      '{
        name: $name,
        path: $path,
        queue: { id: $queueId },
        process: {
          type: 2,
          yamlFilename: $yaml
        },
        repository: {
          id: $repo,
          name: $repo,
          url: $repoUrl,
          type: "GitHub",
          defaultBranch: "refs/heads/main",
          properties: {
            connectedServiceId: $connectionId,
            defaultBranch: "refs/heads/main",
            apiUrl: $apiUrl
          }
        }
      }'
  )"

  PIPELINE_CREATE_BODY_FILE="$WORK/build-definition-create-response.json"
  PIPELINE_CREATE_STATUS="$(curl --silent --show-error -H "$AUTH_HEADER" -H "$JSON_HEADER" -X POST --data "$PIPELINE_BODY" -o "$PIPELINE_CREATE_BODY_FILE" -w '%{http_code}' "$API_ROOT/$PROJECT_ID/_apis/build/definitions?api-version=7.1")"
  if [ "$PIPELINE_CREATE_STATUS" -lt 200 ] || [ "$PIPELINE_CREATE_STATUS" -ge 300 ]; then
    echo "Azure DevOps build-definition creation failed with HTTP $PIPELINE_CREATE_STATUS." >&2
    jq -c '{message, typeName, errorCode, eventId}' "$PIPELINE_CREATE_BODY_FILE" 2>/dev/null >&2 || cat "$PIPELINE_CREATE_BODY_FILE" >&2
    exit 1
  fi

  PIPELINE_ID="$(jq -r '.id // empty' "$PIPELINE_CREATE_BODY_FILE")"
  test -n "$PIPELINE_ID"
  echo "Created Azure DevOps pipeline: $PIPELINE_NAME ($PIPELINE_ID)"
else
  echo "Azure DevOps pipeline already exists: $PIPELINE_NAME ($PIPELINE_ID)"

  EXISTING_DEFINITION_FILE="$WORK/build-definition-existing.json"
  api "$API_ROOT/$PROJECT_ID/_apis/build/definitions/$PIPELINE_ID?api-version=7.1" > "$EXISTING_DEFINITION_FILE"
  EXISTING_QUEUE_ID="$(jq -r '.queue.id // empty' "$EXISTING_DEFINITION_FILE")"

  if [ "$EXISTING_QUEUE_ID" != "$AZURE_PIPELINES_QUEUE_ID" ]; then
    UPDATED_DEFINITION_FILE="$WORK/build-definition-updated.json"
    jq --argjson queueId "$AZURE_PIPELINES_QUEUE_ID" '.queue = {id: $queueId}' "$EXISTING_DEFINITION_FILE" > "$UPDATED_DEFINITION_FILE"

    DEFINITION_UPDATE_BODY_FILE="$WORK/build-definition-update-response.json"
    DEFINITION_UPDATE_STATUS="$(curl --silent --show-error -H "$AUTH_HEADER" -H "$JSON_HEADER" -X PUT --data-binary "@$UPDATED_DEFINITION_FILE" -o "$DEFINITION_UPDATE_BODY_FILE" -w '%{http_code}' "$API_ROOT/$PROJECT_ID/_apis/build/definitions/$PIPELINE_ID?api-version=7.1")"
    if [ "$DEFINITION_UPDATE_STATUS" -lt 200 ] || [ "$DEFINITION_UPDATE_STATUS" -ge 300 ]; then
      echo "Azure DevOps build-definition queue repair failed with HTTP $DEFINITION_UPDATE_STATUS." >&2
      jq -c '{message, typeName, errorCode, eventId}' "$DEFINITION_UPDATE_BODY_FILE" 2>/dev/null >&2 || cat "$DEFINITION_UPDATE_BODY_FILE" >&2
      exit 1
    fi

    echo "Attached Azure Pipelines hosted queue to existing pipeline: $PIPELINE_NAME ($PIPELINE_ID)"
  else
    echo "Azure DevOps pipeline already has the hosted queue: $PIPELINE_NAME ($PIPELINE_ID)"
  fi
fi

VERIFY_GROUP="$(api "$API_ROOT/$PROJECT_ID/_apis/distributedtask/variablegroups?groupName=$(urlencode "$GROUP_NAME")&api-version=7.1")"
printf '%s' "$VERIFY_GROUP" | jq -e '
  .value[0].name == "theouthaven-mobile-production" and
  .value[0].variables.IOS_CERTIFICATE_SECURE_FILE.value == "theouthaven-ios-distribution.p12" and
  .value[0].variables.IOS_PROFILE_SECURE_FILE.value == "theouthaven-appstore.mobileprovision" and
  .value[0].variables.APP_STORE_CONNECT_KEY_SECURE_FILE.value == "theouthaven-appstore-connect.p8" and
  .value[0].variables.ANDROID_KEYSTORE_SECURE_FILE.value == "theouthaven-android-upload.jks" and
  .value[0].variables.GOOGLE_PLAY_SERVICE_ACCOUNT_SECURE_FILE.value == "theouthaven-google-play-service-account.json"
' >/dev/null

for name in   "$IOS_CERTIFICATE_SECURE_FILE"   "$IOS_PROFILE_SECURE_FILE"   "$APP_STORE_CONNECT_KEY_SECURE_FILE"   "$ANDROID_KEYSTORE_SECURE_FILE"   "$GOOGLE_PLAY_SERVICE_ACCOUNT_SECURE_FILE"; do
  response="$(api "$API_ROOT/$PROJECT_ID/_apis/distributedtask/securefiles?namePattern=$(urlencode "$name")&api-version=7.2-preview.1")"
  printf '%s' "$response" | jq -e --arg name "$name" 'any(.value[]?; .name == $name)' >/dev/null
done

api "$API_ROOT/$PROJECT_ID/_apis/build/definitions/$PIPELINE_ID?api-version=7.1" | jq -e --arg name "$PIPELINE_NAME" --argjson queueId "$AZURE_PIPELINES_QUEUE_ID" '.name == $name and .queue.id == $queueId and .process.type == 2 and .process.yamlFilename == "azure-pipelines-mobile.yml"' >/dev/null

echo "Azure DevOps mobile release prerequisites are configured from the Admin Credential Vault."
echo "Pipeline ID: $PIPELINE_ID"
