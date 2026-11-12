#!/usr/bin/env bash
set -euo pipefail

: "${RELEASE_SHA:?RELEASE_SHA is required}"
: "${DEPLOY_ENABLED:?DEPLOY_ENABLED is required}"

AZURE_RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-rg-toh-consumer-production}"
PRIMARY_APP="${PRIMARY_APP:-ca-toh-consumer-prod-primary}"
SECONDARY_APP="${SECONDARY_APP:-ca-toh-consumer-prod-secondary}"
ROLLOUT_RISK="${ROLLOUT_RISK:-high}"
SITE_URL="https://theouthaven.com"

case "$ROLLOUT_RISK" in
  low|medium|high) ;;
  *) echo "Invalid ROLLOUT_RISK: $ROLLOUT_RISK" >&2; exit 1 ;;
esac

if [ "$DEPLOY_ENABLED" != "true" ]; then
  echo "Deploy is disabled. Validation completed for $RELEASE_SHA."
  exit 0
fi

for tool in az docker jq python3 curl keytool; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "Required tool is missing: $tool" >&2
    exit 1
  }
done

get_env_value() {
  local app_json="$1"
  local name="$2"
  jq -r --arg name "$name" '
    .properties.template.containers[0].env
    | map(select(.name == $name))
    | .[0].value // empty
  ' <<<"$app_json"
}

echo "Resolving current production configuration from Azure..."
PRIMARY_JSON="$(az containerapp show --resource-group "$AZURE_RESOURCE_GROUP" --name "$PRIMARY_APP" -o json)"
SECONDARY_JSON="$(az containerapp show --resource-group "$AZURE_RESOURCE_GROUP" --name "$SECONDARY_APP" -o json)"

SUPABASE_URL="$(get_env_value "$PRIMARY_JSON" NEXT_PUBLIC_SUPABASE_URL)"
SUPABASE_ANON_KEY="$(get_env_value "$PRIMARY_JSON" NEXT_PUBLIC_SUPABASE_ANON_KEY)"
TURNSTILE_SITE_KEY="$(get_env_value "$PRIMARY_JSON" NEXT_PUBLIC_TURNSTILE_SITE_KEY)"
IOS_TEAM_ID="$(get_env_value "$PRIMARY_JSON" IOS_TEAM_ID)"
ANDROID_APP_LINK_SHA256_FINGERPRINTS="$(get_env_value "$PRIMARY_JSON" ANDROID_APP_LINK_SHA256_FINGERPRINTS)"

for pair in   "SUPABASE_URL=$SUPABASE_URL"   "SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY"   "TURNSTILE_SITE_KEY=$TURNSTILE_SITE_KEY"   "IOS_TEAM_ID=$IOS_TEAM_ID"   "ANDROID_APP_LINK_SHA256_FINGERPRINTS=$ANDROID_APP_LINK_SHA256_FINGERPRINTS"; do
  name="${pair%%=*}"
  value="${pair#*=}"
  test -n "$value" || {
    echo "Current Azure consumer runtime is missing required value: $name" >&2
    exit 1
  }
done

KEY_VAULT="$(az keyvault list --resource-group "$AZURE_RESOURCE_GROUP" --query '[0].name' -o tsv)"
test -n "$KEY_VAULT" || {
  echo "Production Azure Key Vault was not found in $AZURE_RESOURCE_GROUP." >&2
  exit 1
}

read_secret() {
  local name="$1"
  az keyvault secret show --vault-name "$KEY_VAULT" --name "$name" --query value -o tsv
}

SUPABASE_SERVICE_ROLE_KEY="$(read_secret consumer-supabase-service-role-key-primary)"
TURNSTILE_SECRET_KEY="$(read_secret consumer-turnstile-secret-key-primary)"
MAPBOX_ACCESS_TOKEN="$(read_secret consumer-mapbox-access-token-primary 2>/dev/null || true)"

test -n "$SUPABASE_SERVICE_ROLE_KEY" || { echo "Supabase service-role secret is unavailable." >&2; exit 1; }
test -n "$TURNSTILE_SECRET_KEY" || { echo "Turnstile secret is unavailable." >&2; exit 1; }

PRIMARY_AI="$(az cognitiveservices account list --resource-group "$AZURE_RESOURCE_GROUP" --query "[?kind=='AIServices' && location=='eastus2'] | [0].name" -o tsv)"
SECONDARY_AI="$(az cognitiveservices account list --resource-group "$AZURE_RESOURCE_GROUP" --query "[?kind=='AIServices' && location=='centralus'] | [0].name" -o tsv)"

test -n "$PRIMARY_AI" || { echo "Primary Azure AI account is missing." >&2; exit 1; }
test -n "$SECONDARY_AI" || { echo "Secondary Azure AI account is missing." >&2; exit 1; }

PRIMARY_AI_ENDPOINT="$(az cognitiveservices account show --resource-group "$AZURE_RESOURCE_GROUP" --name "$PRIMARY_AI" --query properties.endpoint -o tsv)"
SECONDARY_AI_ENDPOINT="$(az cognitiveservices account show --resource-group "$AZURE_RESOURCE_GROUP" --name "$SECONDARY_AI" --query properties.endpoint -o tsv)"
PRIMARY_AI_KEY="$(az cognitiveservices account keys list --resource-group "$AZURE_RESOURCE_GROUP" --name "$PRIMARY_AI" --query key1 -o tsv)"
SECONDARY_AI_KEY="$(az cognitiveservices account keys list --resource-group "$AZURE_RESOURCE_GROUP" --name "$SECONDARY_AI" --query key1 -o tsv)"

ACR="$(az acr list --resource-group "$AZURE_RESOURCE_GROUP" --query '[0].name' -o tsv)"
test -n "$ACR" || { echo "Production Azure Container Registry was not found." >&2; exit 1; }
IMAGE="$ACR.azurecr.io/consumer:$RELEASE_SHA"

PRIMARY_PREVIOUS_REVISION="$(az containerapp revision list --resource-group "$AZURE_RESOURCE_GROUP" --name "$PRIMARY_APP" --all --query "sort_by([?properties.active==\`true\`], &properties.createdTime)[-1].name" -o tsv)"
SECONDARY_PREVIOUS_REVISION="$(az containerapp revision list --resource-group "$AZURE_RESOURCE_GROUP" --name "$SECONDARY_APP" --all --query "sort_by([?properties.active==\`true\`], &properties.createdTime)[-1].name" -o tsv)"

test -n "$PRIMARY_PREVIOUS_REVISION" || { echo "No active primary revision found." >&2; exit 1; }
test -n "$SECONDARY_PREVIOUS_REVISION" || { echo "No active secondary revision found." >&2; exit 1; }

echo "Logging in to ACR $ACR..."
az acr login --name "$ACR"

if az acr repository show-tags   --name "$ACR"   --repository consumer   --query "[?@=='$RELEASE_SHA'] | [0]"   -o tsv | grep -qx "$RELEASE_SHA"; then
  echo "Reusing existing immutable image $IMAGE"
else
  echo "Building immutable consumer image $IMAGE"
  docker build     --file infra/azure/consumer-runtime/Dockerfile     --build-arg NEXT_PUBLIC_SITE_URL="$SITE_URL"     --build-arg NEXT_PUBLIC_SUPABASE_URL="$SUPABASE_URL"     --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY"     --build-arg NEXT_PUBLIC_TURNSTILE_SITE_KEY="$TURNSTILE_SITE_KEY"     --tag "$IMAGE"     .
  docker push "$IMAGE"
fi

export SUPABASE_URL
export SUPABASE_SERVICE_ROLE_KEY
export RELEASE_ID="azure-consumer-production-$RELEASE_SHA"
export RELEASE_SOURCE="azure-devops"
export RELEASE_ACTOR="azure-pipelines"
export RELEASE_ARTIFACT_REF="$IMAGE"
export GIT_SHA="$RELEASE_SHA"
export RELEASE_STATE="CANDIDATE"
export RELEASE_EVENT_TYPE="azure_devops_failover_image_ready"
export RELEASE_EVIDENCE="{\"pipeline\":\"azure-devops-consumer-failover\",\"stage\":\"image_ready\"}"
bash .github/scripts/write-platform-release.sh

deploy_runtime() {
  az deployment sub create     --name toh-consumer-runtime-production     --location eastus2     --template-file infra/azure/main.bicep     --parameters infra/azure/parameters/production.bicepparam     aiModelDeploymentEnabled=false     aiEmbeddingDeploymentEnabled=false     consumerRuntimeEnabled=true     consumerRegionalFailoverEnabled=true     consumerEdgeEnabled=true     consumerImage="$IMAGE"     consumerGitSha="$RELEASE_SHA"     consumerNextPublicSiteUrl="$SITE_URL"     consumerNextPublicSupabaseUrl="$SUPABASE_URL"     consumerNextPublicSupabaseAnonKey="$SUPABASE_ANON_KEY"     consumerNextPublicTurnstileSiteKey="$TURNSTILE_SITE_KEY"     consumerTurnstileSecretKey="$TURNSTILE_SECRET_KEY"     consumerSupabaseServiceRoleKey="$SUPABASE_SERVICE_ROLE_KEY"     consumerAzureAiEndpoint="$PRIMARY_AI_ENDPOINT"     consumerAzureAiApiKey="$PRIMARY_AI_KEY"     consumerSecondaryAzureAiEndpoint="$SECONDARY_AI_ENDPOINT"     consumerSecondaryAzureAiApiKey="$SECONDARY_AI_KEY"     consumerAzureAiModel=toh-primary     consumerHuggingFaceAiEndpoint=""     consumerHuggingFaceAiToken=""     consumerHuggingFaceAiModel=""     consumerMapboxAccessToken="$MAPBOX_ACCESS_TOKEN"     consumerShortLinkBaseUrl="https://outhvn.com"     consumerShortLinkHost="outhvn.com"     consumerIosTeamId="$IOS_TEAM_ID"     consumerAndroidAppLinkSha256Fingerprints="$ANDROID_APP_LINK_SHA256_FINGERPRINTS"     consumerPrimaryStableRevisionName="$PRIMARY_PREVIOUS_REVISION"     consumerSecondaryStableRevisionName="$SECONDARY_PREVIOUS_REVISION"     consumerInitialCanaryWeight=0
}

echo "Running production what-if..."
az deployment sub what-if   --name toh-consumer-runtime-production   --location eastus2   --template-file infra/azure/main.bicep   --parameters infra/azure/parameters/production.bicepparam   aiModelDeploymentEnabled=false   aiEmbeddingDeploymentEnabled=false   consumerRuntimeEnabled=true   consumerRegionalFailoverEnabled=true   consumerEdgeEnabled=true   consumerImage="$IMAGE"   consumerGitSha="$RELEASE_SHA"   consumerNextPublicSiteUrl="$SITE_URL"   consumerNextPublicSupabaseUrl="$SUPABASE_URL"   consumerNextPublicSupabaseAnonKey="$SUPABASE_ANON_KEY"   consumerNextPublicTurnstileSiteKey="$TURNSTILE_SITE_KEY"   consumerTurnstileSecretKey="$TURNSTILE_SECRET_KEY"   consumerSupabaseServiceRoleKey="$SUPABASE_SERVICE_ROLE_KEY"   consumerAzureAiEndpoint="$PRIMARY_AI_ENDPOINT"   consumerAzureAiApiKey="$PRIMARY_AI_KEY"   consumerSecondaryAzureAiEndpoint="$SECONDARY_AI_ENDPOINT"   consumerSecondaryAzureAiApiKey="$SECONDARY_AI_KEY"   consumerAzureAiModel=toh-primary   consumerHuggingFaceAiEndpoint=""   consumerHuggingFaceAiToken=""   consumerHuggingFaceAiModel=""   consumerMapboxAccessToken="$MAPBOX_ACCESS_TOKEN"   consumerShortLinkBaseUrl="https://outhvn.com"   consumerShortLinkHost="outhvn.com"   consumerIosTeamId="$IOS_TEAM_ID"   consumerAndroidAppLinkSha256Fingerprints="$ANDROID_APP_LINK_SHA256_FINGERPRINTS"   consumerPrimaryStableRevisionName="$PRIMARY_PREVIOUS_REVISION"   consumerSecondaryStableRevisionName="$SECONDARY_PREVIOUS_REVISION"   consumerInitialCanaryWeight=0

echo "Deploying production runtime..."
for attempt in 1 2 3 4 5; do
  if deploy_runtime 2>"/tmp/azure-devops-consumer-failover.err"; then
    break
  fi
  cat "/tmp/azure-devops-consumer-failover.err" >&2
  if ! grep -q 'RequestConflict\|Another operation is being performed' "/tmp/azure-devops-consumer-failover.err"; then
    exit 1
  fi
  if [ "$attempt" -eq 5 ]; then
    echo "Azure runtime deployment remained locked after 5 attempts." >&2
    exit 1
  fi
  delay=$((attempt * 30))
  echo "Azure resource is busy; retrying in ${delay}s."
  sleep "$delay"
done

PRIMARY_CANDIDATE_REVISION="$(az containerapp revision list --resource-group "$AZURE_RESOURCE_GROUP" --name "$PRIMARY_APP" --all --query "sort_by([?properties.template.containers[0].image=='$IMAGE'], &properties.createdTime)[-1].name" -o tsv)"
SECONDARY_CANDIDATE_REVISION="$(az containerapp revision list --resource-group "$AZURE_RESOURCE_GROUP" --name "$SECONDARY_APP" --all --query "sort_by([?properties.template.containers[0].image=='$IMAGE'], &properties.createdTime)[-1].name" -o tsv)"

test -n "$PRIMARY_CANDIDATE_REVISION" || { echo "Primary candidate revision not found." >&2; exit 1; }
test -n "$SECONDARY_CANDIDATE_REVISION" || { echo "Secondary candidate revision not found." >&2; exit 1; }
test "$PRIMARY_CANDIDATE_REVISION" != "$PRIMARY_PREVIOUS_REVISION" || { echo "Primary deployment did not create a new revision." >&2; exit 1; }
test "$SECONDARY_CANDIDATE_REVISION" != "$SECONDARY_PREVIOUS_REVISION" || { echo "Secondary deployment did not create a new revision." >&2; exit 1; }

PRIMARY_CANDIDATE_FQDN="$(az containerapp revision show --resource-group "$AZURE_RESOURCE_GROUP" --name "$PRIMARY_APP" --revision "$PRIMARY_CANDIDATE_REVISION" --query properties.fqdn -o tsv)"
SECONDARY_CANDIDATE_FQDN="$(az containerapp revision show --resource-group "$AZURE_RESOURCE_GROUP" --name "$SECONDARY_APP" --revision "$SECONDARY_CANDIDATE_REVISION" --query properties.fqdn -o tsv)"
PRIMARY_APP_FQDN="$(az containerapp show --resource-group "$AZURE_RESOURCE_GROUP" --name "$PRIMARY_APP" --query properties.configuration.ingress.fqdn -o tsv)"
SECONDARY_APP_FQDN="$(az containerapp show --resource-group "$AZURE_RESOURCE_GROUP" --name "$SECONDARY_APP" --query properties.configuration.ingress.fqdn -o tsv)"

export AZURE_RESOURCE_GROUP
export PRIMARY_APP
export SECONDARY_APP
export PRIMARY_PREVIOUS_REVISION
export SECONDARY_PREVIOUS_REVISION
export PRIMARY_CANDIDATE_REVISION
export SECONDARY_CANDIDATE_REVISION
export PRIMARY_CANDIDATE_FQDN
export SECONDARY_CANDIDATE_FQDN
export PRIMARY_APP_FQDN
export SECONDARY_APP_FQDN
export IMAGE_SHA="$RELEASE_SHA"
export ROLLOUT_RISK
export RELEASE_ID
export RELEASE_ARTIFACT_REF="$IMAGE"
export RELEASE_SOURCE="azure-devops"
export RELEASE_ACTOR="azure-pipelines"

bash .github/scripts/rollout-azure-consumer-canary.sh

PRIMARY_HOST="$(az deployment sub show --name toh-consumer-runtime-production --query properties.outputs.consumerRuntimeFqdn.value -o tsv)"
SECONDARY_HOST="$(az deployment sub show --name toh-consumer-runtime-production --query properties.outputs.consumerSecondaryRuntimeFqdn.value -o tsv)"
EDGE_HOST="$(az deployment sub show --name toh-consumer-runtime-production --query properties.outputs.consumerFrontDoorEndpointHostName.value -o tsv)"

python3 .github/scripts/prove-azure-frontdoor.py --host "$PRIMARY_HOST" --sha "$RELEASE_SHA" --roles primary --attempts 24 --interval 10 --label "Azure DevOps direct primary"
python3 .github/scripts/prove-azure-frontdoor.py --host "$SECONDARY_HOST" --sha "$RELEASE_SHA" --roles secondary --attempts 24 --interval 10 --label "Azure DevOps direct secondary"
python3 .github/scripts/prove-azure-frontdoor.py --host "$EDGE_HOST" --sha "$RELEASE_SHA" --roles primary,secondary --attempts 90 --interval 10 --label "Azure DevOps Front Door"

export RELEASE_STATE="STABLE"
export RELEASE_EVENT_TYPE="azure_devops_failover_frontdoor_proven"
export RELEASE_EVIDENCE="{\"pipeline\":\"azure-devops-consumer-failover\",\"stage\":\"frontdoor_proven\",\"primary\":\"eastus2\",\"secondary\":\"centralus\"}"
bash .github/scripts/write-platform-release.sh

echo "Azure DevOps failover deployment is stable at $RELEASE_SHA."
