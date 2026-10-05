#!/usr/bin/env bash
set -euo pipefail

MOBILE_SIGNING_SECRET_ID="${MOBILE_SIGNING_SECRET_ID:-/theouthaven/credential-vault/production/mobile}"
WORK="${RUNNER_TEMP:-/tmp}/theouthaven-consumer-failover-bootstrap-${GITHUB_RUN_ID:-$$}"
mkdir -p "$WORK"
chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT

for tool in aws jq curl python3 base64; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Required tool is missing: $tool" >&2; exit 1; }
done

aws secretsmanager get-secret-value   --secret-id "$MOBILE_SIGNING_SECRET_ID"   --query SecretString   --output text > "$WORK/mobile.json"

AZDO_ORG="$(jq -r '.azureDevOpsOrg // empty' "$WORK/mobile.json")"
AZDO_PROJECT="$(jq -r '.azureDevOpsProject // empty' "$WORK/mobile.json")"
AZDO_PAT="$(jq -r '.azureDevOpsPat // empty' "$WORK/mobile.json")"
AZDO_GITHUB_SERVICE_CONNECTION_ID="$(jq -r '.azureDevOpsGithubServiceConnectionId // empty' "$WORK/mobile.json")"

for pair in   "AZDO_ORG=$AZDO_ORG"   "AZDO_PROJECT=$AZDO_PROJECT"   "AZDO_PAT=$AZDO_PAT"; do
  name="${pair%%=*}"
  value="${pair#*=}"
  test -n "$value" || { echo "$name is missing from Mobile Release Signing vault." >&2; exit 1; }
done

urlencode() {
  python3 - "$1" <<'PY'
import sys
from urllib.parse import quote
print(quote(sys.argv[1], safe=''))
PY
}

API_ROOT="https://dev.azure.com/$AZDO_ORG"
AUTH_HEADER="Authorization: Basic $(printf ':%s' "$AZDO_PAT" | base64 | tr -d '\n')"
JSON_HEADER="Content-Type: application/json"

api() {
  curl --fail --silent --show-error -H "$AUTH_HEADER" "$@"
}

PROJECT_JSON="$(api "$API_ROOT/_apis/projects/$(urlencode "$AZDO_PROJECT")?api-version=7.1")"
PROJECT_ID="$(printf '%s' "$PROJECT_JSON" | jq -r '.id // empty')"
PROJECT_NAME="$(printf '%s' "$PROJECT_JSON" | jq -r '.name // empty')"
test -n "$PROJECT_ID" && test -n "$PROJECT_NAME"

if [ -z "$AZDO_GITHUB_SERVICE_CONNECTION_ID" ]; then
  ENDPOINTS="$(api "$API_ROOT/$PROJECT_ID/_apis/serviceendpoint/endpoints?api-version=7.1")"
  GITHUB_CONNECTIONS="$(printf '%s' "$ENDPOINTS" | jq '{value:[.value[]? | select((.type // "" | ascii_downcase) == "github")]}')"
  COUNT="$(printf '%s' "$GITHUB_CONNECTIONS" | jq '.value | length')"
  if [ "$COUNT" -eq 1 ]; then
    AZDO_GITHUB_SERVICE_CONNECTION_ID="$(printf '%s' "$GITHUB_CONNECTIONS" | jq -r '.value[0].id')"
  else
    echo "Unable to identify exactly one Azure DevOps GitHub service connection." >&2
    exit 1
  fi
fi

ENDPOINTS="$(api "$API_ROOT/$PROJECT_ID/_apis/serviceendpoint/endpoints?api-version=7.1")"
AZURE_ENDPOINTS="$(printf '%s' "$ENDPOINTS" | jq '{value:[.value[]? | select((.type // "" | ascii_downcase) == "azurerm")]}')"
PREFERRED_AZURE_NAME="TheOutHaven Azure Production"
AZURE_SERVICE_CONNECTION="$(printf '%s' "$AZURE_ENDPOINTS" | jq -r --arg preferred "$PREFERRED_AZURE_NAME" '
  ([.value[]? | select(.name == $preferred)] | first | .name) //
  (if (.value | length) == 1 then .value[0].name else empty end)
')"

if [ -z "$AZURE_SERVICE_CONNECTION" ]; then
  echo "No unique AzureRM service connection was found in Azure DevOps project $PROJECT_NAME." >&2
  echo "Create a workload-identity Azure Resource Manager service connection for the production subscription." >&2
  exit 1
fi

echo "Azure service connection selected: $AZURE_SERVICE_CONNECTION"

GROUP_NAME="theouthaven-consumer-failover"
GROUPS="$(api "$API_ROOT/$PROJECT_ID/_apis/distributedtask/variablegroups?groupName=$(urlencode "$GROUP_NAME")&api-version=7.1")"
GROUP_ID="$(printf '%s' "$GROUPS" | jq -r '.value[0].id // empty')"

GROUP_BODY="$(jq -n   --arg projectId "$PROJECT_ID"   --arg projectName "$PROJECT_NAME"   --arg name "$GROUP_NAME"   --arg azureConnection "$AZURE_SERVICE_CONNECTION"   '{
    name:$name,
    description:"TheOutHaven consumer CI/CD failover control-plane settings.",
    type:"Vsts",
    variableGroupProjectReferences:[{
      projectReference:{id:$projectId,name:$projectName},
      name:$name,
      description:"Consumer failover pipeline settings."
    }],
    variables:{
      AZURE_SERVICE_CONNECTION:{value:$azureConnection}
    }
  }')"

if [ -n "$GROUP_ID" ]; then
  api -X PUT -H "$JSON_HEADER" --data "$GROUP_BODY"     "$API_ROOT/_apis/distributedtask/variablegroups/$GROUP_ID?api-version=7.1" >/dev/null
  echo "Updated Azure DevOps variable group: $GROUP_NAME"
else
  CREATED="$(api -X POST -H "$JSON_HEADER" --data "$GROUP_BODY"     "$API_ROOT/_apis/distributedtask/variablegroups?api-version=7.1")"
  GROUP_ID="$(printf '%s' "$CREATED" | jq -r '.id // empty')"
  test -n "$GROUP_ID"
  echo "Created Azure DevOps variable group: $GROUP_NAME"
fi

QUEUES="$(api "$API_ROOT/$PROJECT_ID/_apis/distributedtask/queues?api-version=7.1")"
HOSTED_QUEUE_ID="$(printf '%s' "$QUEUES" | jq -r '
  [.value[]? | select((.name=="Azure Pipelines") or (.pool.isHosted==true))]
  | .[0].id // empty
')"
test -n "$HOSTED_QUEUE_ID" || { echo "Microsoft-hosted Azure Pipelines queue is unavailable." >&2; exit 1; }

PIPELINE_NAME="TheOutHaven Consumer Failover"
PIPELINE_FOLDER="\\TheOutHaven"
PIPELINE_YAML="azure-pipelines-consumer-failover.yml"
GITHUB_REPOSITORY="DevSoft-Development/roseout"
GITHUB_REPOSITORY_URL="https://github.com/DevSoft-Development/roseout"
GITHUB_API_URL="https://api.github.com/repos/DevSoft-Development/roseout"

LIST_URL="$API_ROOT/$PROJECT_ID/_apis/build/definitions?name=$(urlencode "$PIPELINE_NAME")&path=$(urlencode "$PIPELINE_FOLDER")&api-version=7.1"
DEFS="$(api "$LIST_URL")"
PIPELINE_ID="$(printf '%s' "$DEFS" | jq -r --arg name "$PIPELINE_NAME" '.value[]? | select(.name==$name) | .id' | head -1)"

BODY="$(jq -n   --arg name "$PIPELINE_NAME"   --arg path "$PIPELINE_FOLDER"   --arg yaml "$PIPELINE_YAML"   --arg repo "$GITHUB_REPOSITORY"   --arg repoUrl "$GITHUB_REPOSITORY_URL"   --arg apiUrl "$GITHUB_API_URL"   --arg connectionId "$AZDO_GITHUB_SERVICE_CONNECTION_ID"   --argjson queueId "$HOSTED_QUEUE_ID"   '{
    name:$name,
    path:$path,
    queue:{id:$queueId},
    process:{type:2,yamlFilename:$yaml},
    repository:{
      id:$repo,
      name:$repo,
      url:$repoUrl,
      type:"GitHub",
      defaultBranch:"refs/heads/main",
      properties:{
        connectedServiceId:$connectionId,
        defaultBranch:"refs/heads/main",
        apiUrl:$apiUrl
      }
    }
  }')"

if [ -z "$PIPELINE_ID" ]; then
  CREATED="$(api -X POST -H "$JSON_HEADER" --data "$BODY"     "$API_ROOT/$PROJECT_ID/_apis/build/definitions?api-version=7.1")"
  PIPELINE_ID="$(printf '%s' "$CREATED" | jq -r '.id // empty')"
  test -n "$PIPELINE_ID"
  echo "Created Azure DevOps pipeline: $PIPELINE_NAME ($PIPELINE_ID)"
else
  EXISTING="$WORK/definition.json"
  api "$API_ROOT/$PROJECT_ID/_apis/build/definitions/$PIPELINE_ID?api-version=7.1" > "$EXISTING"
  UPDATED="$WORK/definition-updated.json"
  jq     --arg yaml "$PIPELINE_YAML"     --argjson queueId "$HOSTED_QUEUE_ID"     --arg connectionId "$AZDO_GITHUB_SERVICE_CONNECTION_ID"     '.queue={id:$queueId}
     | .process.type=2
     | .process.yamlFilename=$yaml
     | .repository.properties.connectedServiceId=$connectionId
     | .repository.defaultBranch="refs/heads/main"
     | .repository.properties.defaultBranch="refs/heads/main"'     "$EXISTING" > "$UPDATED"
  api -X PUT -H "$JSON_HEADER" --data-binary "@$UPDATED"     "$API_ROOT/$PROJECT_ID/_apis/build/definitions/$PIPELINE_ID?api-version=7.1" >/dev/null
  echo "Updated Azure DevOps pipeline: $PIPELINE_NAME ($PIPELINE_ID)"
fi

VERIFY_GROUP="$(api "$API_ROOT/$PROJECT_ID/_apis/distributedtask/variablegroups?groupName=$(urlencode "$GROUP_NAME")&api-version=7.1")"
printf '%s' "$VERIFY_GROUP" | jq -e --arg expected "$AZURE_SERVICE_CONNECTION" '
  .value[0].name == "theouthaven-consumer-failover"
  and .value[0].variables.AZURE_SERVICE_CONNECTION.value == $expected
' >/dev/null

api "$API_ROOT/$PROJECT_ID/_apis/build/definitions/$PIPELINE_ID?api-version=7.1"   | jq -e --arg yaml "$PIPELINE_YAML" --argjson queueId "$HOSTED_QUEUE_ID" '
      .queue.id == $queueId
      and .process.type == 2
      and .process.yamlFilename == $yaml
      and .repository.defaultBranch == "refs/heads/main"
    ' >/dev/null

echo "Azure DevOps consumer failover pipeline is configured."
echo "Pipeline ID: $PIPELINE_ID"
echo "Circuit breaker: GitHub Actions primary, Azure DevOps failover."
