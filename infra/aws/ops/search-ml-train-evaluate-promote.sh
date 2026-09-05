#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_URL:?SUPABASE_URL is required}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required}"
: "${AWS_ACCOUNT_ID:?AWS_ACCOUNT_ID is required}"
: "${AWS_REGION:?AWS_REGION is required}"
: "${ECR_REPOSITORY:?ECR_REPOSITORY is required}"
: "${SEARCH_ML_STACK_NAME:?SEARCH_ML_STACK_NAME is required}"

MIN_TRAIN_EXAMPLES="${MIN_TRAIN_EXAMPLES:-500}"
MIN_VALIDATION_EXAMPLES="${MIN_VALIDATION_EXAMPLES:-50}"
ROOT="${REPO_ROOT:-$(pwd)}"
WORK_ROOT="${CODEBUILD_SRC_DIR:-/tmp}/search-ml-train"
mkdir -p "$WORK_ROOT"

SERVICE_URL="$(aws cloudformation describe-stacks \
  --stack-name "$SEARCH_ML_STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='ServiceUrl'].OutputValue" \
  --output text)"
SECRET_ARN="$(aws cloudformation describe-stacks \
  --stack-name "$SEARCH_ML_STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='AuthSecretArn'].OutputValue" \
  --output text)"
TOKEN="$(aws secretsmanager get-secret-value --secret-id "$SECRET_ARN" --query SecretString --output text)"

curl --fail --silent --show-error --max-time 300 \
  --header "Authorization: Bearer $TOKEN" \
  "https://www.theouthaven.com/api/cron/search-ml-training-dataset?days=90" \
  > "$WORK_ROOT/training-corpus-refresh.json"

DATASET="$WORK_ROOT/reranker-dataset.json"
COUNTS="$WORK_ROOT/dataset-counts.json"
SUPABASE_URL="$SUPABASE_URL" SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" DATASET="$DATASET" COUNTS="$COUNTS" python3 - <<'PY'
import json, os, urllib.parse, urllib.request
base = os.environ['SUPABASE_URL'] + '/rest/v1/search_reranker_training_examples'
key = os.environ['SUPABASE_SERVICE_ROLE_KEY']
rows = []
start = 0
page = 1000
while True:
    query = urllib.parse.urlencode({
        'select': 'example_key,query,positive_document,negative_document,positive_location_id,negative_location_id,source,signal_weight,market_key,split,review_status',
        'review_status': 'eq.approved',
        'order': 'created_at.asc',
    })
    req = urllib.request.Request(base + '?' + query, headers={
        'apikey': key,
        'Authorization': 'Bearer ' + key,
        'Range': f'{start}-{start + page - 1}',
        'Range-Unit': 'items',
    })
    with urllib.request.urlopen(req, timeout=60) as response:
        chunk = json.load(response)
    rows.extend(chunk)
    if len(chunk) < page:
        break
    start += page
    if start >= 20000:
        break
with open(os.environ['DATASET'], 'w', encoding='utf-8') as handle:
    json.dump(rows, handle)
counts = {}
for row in rows:
    key_name = row.get('split') or 'unknown'
    counts[key_name] = counts.get(key_name, 0) + 1
with open(os.environ['COUNTS'], 'w', encoding='utf-8') as handle:
    json.dump({'total': len(rows), 'splits': counts}, handle)
print(json.dumps({'total': len(rows), 'splits': counts}))
PY

TRAIN_COUNT="$(jq -r '.splits.train // 0' "$COUNTS")"
VALIDATION_COUNT="$(jq -r '.splits.validation // 0' "$COUNTS")"
SOURCE_SHA="${CODEBUILD_RESOLVED_SOURCE_VERSION:-main}"
VERSION="toh-reranker-cb${CODEBUILD_BUILD_NUMBER:-0}-${SOURCE_SHA:0:8}"
STATUS=blocked
ELIGIBLE=false
if [ "$TRAIN_COUNT" -ge "$MIN_TRAIN_EXAMPLES" ] && [ "$VALIDATION_COUNT" -ge "$MIN_VALIDATION_EXAMPLES" ]; then
  STATUS=running
  ELIGIBLE=true
fi

BODY="$(VERSION="$VERSION" STATUS="$STATUS" TRAIN_COUNT="$TRAIN_COUNT" VALIDATION_COUNT="$VALIDATION_COUNT" python3 - <<'PY'
import json, os
print(json.dumps({
    'model_type': 'reranker',
    'requested_version': os.environ['VERSION'],
    'status': os.environ['STATUS'],
    'training_examples': int(os.environ['TRAIN_COUNT']),
    'validation_examples': int(os.environ['VALIDATION_COUNT']),
    'minimum_examples': 500,
    'metadata': {'source': 'aws_codebuild', 'minimum_validation_examples': 50}
}))
PY
)"

curl --fail --silent --show-error \
  --request POST \
  --header "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  --header "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  --header "Content-Type: application/json" \
  --header "Prefer: return=representation" \
  --data "$BODY" \
  "$SUPABASE_URL/rest/v1/search_ml_training_runs" > "$WORK_ROOT/training-run.json"
RUN_ID="$(jq -r '.[0].id' "$WORK_ROOT/training-run.json")"

if [ "$ELIGIBLE" != "true" ]; then
  echo "Training safely blocked: train=$TRAIN_COUNT validation=$VALIDATION_COUNT"
  exit 0
fi

python3 -m pip install --disable-pip-version-check --index-url https://download.pytorch.org/whl/cpu torch==2.12.1
python3 -m pip install --disable-pip-version-check sentence-transformers==6.0.0 transformers==5.16.1 sentencepiece==0.2.2 protobuf==7.36.0

rm -rf "$ROOT/infra/aws/search-ml-service/trained-reranker"/*
python3 "$ROOT/infra/aws/search-ml-service/train_reranker.py" \
  --dataset "$DATASET" \
  --output "$ROOT/infra/aws/search-ml-service/trained-reranker" \
  --base-model cross-encoder/ms-marco-MiniLM-L6-v2 \
  --epochs 1 \
  --batch-size 16

EVALUATION="$WORK_ROOT/reranker-evaluation.json"
python3 "$ROOT/infra/aws/search-ml-service/evaluate_reranker.py" \
  --dataset "$DATASET" \
  --candidate "$ROOT/infra/aws/search-ml-service/trained-reranker" \
  --base-model cross-encoder/ms-marco-MiniLM-L6-v2 \
  --split validation \
  --output "$EVALUATION" \
  --min-ndcg-lift 0.005
PROMOTE="$(jq -r 'if .promote then "true" else "false" end' "$EVALUATION")"
METRICS="$(cat "$EVALUATION")"

if [ "$PROMOTE" != "true" ]; then
  REJECTED_BODY="$(VERSION="$VERSION" METRICS="$METRICS" python3 - <<'PY'
import json, os
print(json.dumps({
    'model_type':'reranker',
    'model_version':os.environ['VERSION'],
    'base_model':'cross-encoder/ms-marco-MiniLM-L6-v2',
    'status':'rejected',
    'metrics':json.loads(os.environ['METRICS']),
    'evaluation_thresholds':{'min_ndcg_lift':0.005,'no_top1_regression':True,'no_mrr_regression':True}
}))
PY
)"
  curl --fail --silent --show-error --request POST \
    --header "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    --header "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    --header "Content-Type: application/json" \
    --header "Prefer: resolution=merge-duplicates,return=minimal" \
    --data "$REJECTED_BODY" \
    "$SUPABASE_URL/rest/v1/search_ml_model_registry?on_conflict=model_type,model_version"
  curl --fail --silent --show-error --request PATCH \
    --header "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    --header "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    --header "Content-Type: application/json" \
    --data '{"status":"evaluated"}' \
    "$SUPABASE_URL/rest/v1/search_ml_training_runs?id=eq.$RUN_ID"
  echo "Candidate rejected by evaluation gate."
  exit 0
fi

REPO_URI="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY"
IMAGE_URI="$REPO_URI:reranker-${VERSION}"
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
docker build \
  --file "$ROOT/infra/aws/search-ml-service/Dockerfile" \
  --build-arg HF_RERANK_MODEL_VERSION="$VERSION" \
  --tag "$IMAGE_URI" \
  "$ROOT/infra/aws/search-ml-service"
docker push "$IMAGE_URI"

aws cloudformation deploy \
  --stack-name "$SEARCH_ML_STACK_NAME" \
  --template-file "$ROOT/infra/aws/cloudformation/search-ml-service.yml" \
  --capabilities CAPABILITY_NAMED_IAM \
  --no-fail-on-empty-changeset \
  --parameter-overrides Environment=production ImageIdentifier="$IMAGE_URI"

SERVICE_ARN="$(aws cloudformation describe-stacks \
  --stack-name "$SEARCH_ML_STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='ServiceArn'].OutputValue" \
  --output text)"
for attempt in $(seq 1 60); do
  APP_STATUS="$(aws apprunner describe-service --service-arn "$SERVICE_ARN" --query 'Service.Status' --output text)"
  echo "App Runner status: $APP_STATUS"
  if [ "$APP_STATUS" = "RUNNING" ]; then break; fi
  test "$attempt" -lt 60 || exit 1
  sleep 10
done

TOKEN="$(aws secretsmanager get-secret-value --secret-id "$SECRET_ARN" --query SecretString --output text)"
curl --fail --silent --show-error --retry 12 --retry-delay 5 "https://${SERVICE_URL}/health" > "$WORK_ROOT/promoted-health.json"
curl --fail --silent --show-error \
  --header "Authorization: Bearer $TOKEN" \
  --header "Content-Type: application/json" \
  --data '{"query":"romantic seafood rooftop date night","texts":["intimate seafood rooftop restaurant","bowling alley"],"top_n":2}' \
  "https://${SERVICE_URL}/rerank" > "$WORK_ROOT/promoted-rerank.json"
jq -e '.ok == true' "$WORK_ROOT/promoted-health.json" >/dev/null
jq -e '.results[0].index == 0' "$WORK_ROOT/promoted-rerank.json" >/dev/null

curl --fail --silent --show-error --request PATCH \
  --header "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  --header "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  --header "Content-Type: application/json" \
  --data '{"status":"retired"}' \
  "$SUPABASE_URL/rest/v1/search_ml_model_registry?model_type=eq.reranker&status=eq.active"

ACTIVE_BODY="$(VERSION="$VERSION" IMAGE_URI="$IMAGE_URI" METRICS="$METRICS" TRAIN_COUNT="$TRAIN_COUNT" VALIDATION_COUNT="$VALIDATION_COUNT" python3 - <<'PY'
import json, os
print(json.dumps({
    'model_type':'reranker',
    'model_version':os.environ['VERSION'],
    'base_model':'cross-encoder/ms-marco-MiniLM-L6-v2',
    'artifact_uri':os.environ['IMAGE_URI'],
    'status':'active',
    'training_examples':int(os.environ['TRAIN_COUNT']),
    'validation_examples':int(os.environ['VALIDATION_COUNT']),
    'metrics':json.loads(os.environ['METRICS']),
    'evaluation_thresholds':{'min_ndcg_lift':0.005,'no_top1_regression':True,'no_mrr_regression':True}
}))
PY
)"
curl --fail --silent --show-error --request POST \
  --header "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  --header "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  --header "Content-Type: application/json" \
  --header "Prefer: resolution=merge-duplicates,return=minimal" \
  --data "$ACTIVE_BODY" \
  "$SUPABASE_URL/rest/v1/search_ml_model_registry?on_conflict=model_type,model_version"

curl --fail --silent --show-error --request PATCH \
  --header "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  --header "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  --header "Content-Type: application/json" \
  --data "{\"rerank_model\":\"theouthaven/search-reranker\",\"rerank_version\":\"$VERSION\"}" \
  "$SUPABASE_URL/rest/v1/search_ml_runtime_config?singleton=eq.true"
curl --fail --silent --show-error --request PATCH \
  --header "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  --header "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  --header "Content-Type: application/json" \
  --data '{"status":"promoted"}' \
  "$SUPABASE_URL/rest/v1/search_ml_training_runs?id=eq.$RUN_ID"

curl --fail --silent --show-error --max-time 300 \
  --header "Authorization: Bearer $TOKEN" \
  "https://www.theouthaven.com/api/cron/search-hf-production-qa" \
  > "$WORK_ROOT/post-promotion-search-qa.json"

echo "Search ML candidate promoted: $VERSION"
