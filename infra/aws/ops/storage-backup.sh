#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_STORAGE_ACCESS_KEY_ID:?SUPABASE_STORAGE_ACCESS_KEY_ID is required}"
: "${SUPABASE_STORAGE_SECRET_ACCESS_KEY:?SUPABASE_STORAGE_SECRET_ACCESS_KEY is required}"
: "${SUPABASE_STORAGE_ENDPOINT:?SUPABASE_STORAGE_ENDPOINT is required}"
: "${SUPABASE_STORAGE_REGION:?SUPABASE_STORAGE_REGION is required}"
: "${AWS_BACKUP_BUCKET:?AWS_BACKUP_BUCKET is required}"

RCLONE_RELEASE="${RCLONE_RELEASE:-1.74.4}"
BIN_DIR="${CODEBUILD_SRC_DIR:-/tmp}/bin"
WORK_ROOT="${CODEBUILD_SRC_DIR:-/tmp}/theouthaven-storage-backup"
mkdir -p "$BIN_DIR" "$WORK_ROOT/manifests"

if ! command -v rclone >/dev/null 2>&1; then
  ARCHIVE="rclone-v${RCLONE_RELEASE}-linux-amd64.zip"
  DOWNLOAD_DIR="$(mktemp -d)"
  EXTRACT_DIR="$(mktemp -d)"
  curl --fail --location --silent --show-error --retry 5 --retry-delay 2 --retry-all-errors \
    -o "$DOWNLOAD_DIR/$ARCHIVE" "https://downloads.rclone.org/v${RCLONE_RELEASE}/${ARCHIVE}"
  curl --fail --location --silent --show-error --retry 5 --retry-delay 2 --retry-all-errors \
    -o "$DOWNLOAD_DIR/SHA256SUMS" "https://downloads.rclone.org/v${RCLONE_RELEASE}/SHA256SUMS"
  (cd "$DOWNLOAD_DIR" && grep " ${ARCHIVE}$" SHA256SUMS | sha256sum -c -)
  python3 -m zipfile -e "$DOWNLOAD_DIR/$ARCHIVE" "$EXTRACT_DIR"
  install -m 0755 "$EXTRACT_DIR/rclone-v${RCLONE_RELEASE}-linux-amd64/rclone" "$BIN_DIR/rclone"
  export PATH="$BIN_DIR:$PATH"
fi

export RCLONE_CONFIG_SUPABASE_TYPE=s3
export RCLONE_CONFIG_SUPABASE_PROVIDER=Other
export RCLONE_CONFIG_SUPABASE_ACCESS_KEY_ID="$SUPABASE_STORAGE_ACCESS_KEY_ID"
export RCLONE_CONFIG_SUPABASE_SECRET_ACCESS_KEY="$SUPABASE_STORAGE_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_SUPABASE_ENDPOINT="$SUPABASE_STORAGE_ENDPOINT"
export RCLONE_CONFIG_SUPABASE_REGION="$SUPABASE_STORAGE_REGION"
export RCLONE_CONFIG_SUPABASE_FORCE_PATH_STYLE=true

export RCLONE_CONFIG_AWSBACKUP_TYPE=s3
export RCLONE_CONFIG_AWSBACKUP_PROVIDER=AWS
export RCLONE_CONFIG_AWSBACKUP_ENV_AUTH=true
export RCLONE_CONFIG_AWSBACKUP_REGION="${AWS_REGION:-us-east-1}"
export RCLONE_CONFIG_AWSBACKUP_SERVER_SIDE_ENCRYPTION=AES256
export RCLONE_CONFIG_AWSBACKUP_NO_CHECK_BUCKET=true

STAMP="$(date -u +'%Y%m%dT%H%M%SZ')"
YEAR="$(date -u +'%Y')"
MONTH="$(date -u +'%m')"
DAY="$(date -u +'%d')"
MANIFEST_PREFIX="storage/manifests/${YEAR}/${MONTH}/${DAY}/${STAMP}"

mapfile -t BUCKETS < <(rclone lsf supabase: --dirs-only | sed 's:/$::' | sort)
test "${#BUCKETS[@]}" -gt 0 || { echo "Supabase Storage returned no buckets" >&2; exit 1; }

TOTAL_OBJECTS=0
TOTAL_BYTES=0
for bucket in "${BUCKETS[@]}"; do
  echo "Backing up bucket: ${bucket}"
  DEST="awsbackup:${AWS_BACKUP_BUCKET}/storage/objects/${bucket}"
  rclone copy "supabase:${bucket}" "$DEST" \
    --fast-list --transfers 8 --checkers 16 --retries 5 --low-level-retries 10 \
    --timeout 10m --contimeout 30s --log-level INFO
  rclone check "supabase:${bucket}" "$DEST" --one-way --size-only --checkers 16 --retries 3

  MANIFEST="$WORK_ROOT/manifests/${bucket}.json"
  rclone lsjson "supabase:${bucket}" --recursive --files-only > "$MANIFEST"
  COUNT="$(jq 'length' "$MANIFEST")"
  BYTES="$(jq '[.[].Size] | add // 0' "$MANIFEST")"
  TOTAL_OBJECTS=$((TOTAL_OBJECTS + COUNT))
  TOTAL_BYTES=$((TOTAL_BYTES + BYTES))

  aws s3 cp "$MANIFEST" \
    "s3://${AWS_BACKUP_BUCKET}/${MANIFEST_PREFIX}/${bucket}.json" \
    --sse AES256 --only-show-errors \
    --metadata "codebuild-id=${CODEBUILD_BUILD_ID:-unknown},source-bucket=${bucket},object-count=${COUNT},source-bytes=${BYTES}"
done

jq -n \
  --arg created_at "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
  --arg source_endpoint "$SUPABASE_STORAGE_ENDPOINT" \
  --arg source_region "$SUPABASE_STORAGE_REGION" \
  --arg destination_bucket "$AWS_BACKUP_BUCKET" \
  --arg destination_prefix "storage/objects" \
  --arg manifest_prefix "$MANIFEST_PREFIX" \
  --arg build_id "${CODEBUILD_BUILD_ID:-unknown}" \
  --argjson bucket_count "${#BUCKETS[@]}" \
  --argjson object_count "$TOTAL_OBJECTS" \
  --argjson bytes "$TOTAL_BYTES" \
  '{created_at:$created_at,source_endpoint:$source_endpoint,source_region:$source_region,destination_bucket:$destination_bucket,destination_prefix:$destination_prefix,manifest_prefix:$manifest_prefix,bucket_count:$bucket_count,object_count:$object_count,bytes:$bytes,aws_codebuild_id:$build_id}' \
  > "$WORK_ROOT/summary.json"

aws s3 cp "$WORK_ROOT/summary.json" \
  "s3://${AWS_BACKUP_BUCKET}/${MANIFEST_PREFIX}/summary.json" \
  --sse AES256 --only-show-errors
aws s3api head-object --bucket "$AWS_BACKUP_BUCKET" --key "${MANIFEST_PREFIX}/summary.json" >/dev/null

echo "Verified storage backup: ${#BUCKETS[@]} buckets, ${TOTAL_OBJECTS} objects, ${TOTAL_BYTES} bytes"
