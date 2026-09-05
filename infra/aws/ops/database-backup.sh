#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is required}"
: "${AWS_BACKUP_BUCKET:?AWS_BACKUP_BUCKET is required}"

WORK_ROOT="${CODEBUILD_SRC_DIR:-/tmp}/theouthaven-database-backup"
rm -rf "$WORK_ROOT"
mkdir -p "$WORK_ROOT/database"
cd "$WORK_ROOT/database"

pg_dumpall --dbname="$SUPABASE_DB_URL" --roles-only --no-role-passwords > roles.sql
pg_dump --dbname="$SUPABASE_DB_URL" --schema-only --no-owner --no-privileges > schema.sql
pg_dump --dbname="$SUPABASE_DB_URL" --data-only --use-copy --no-owner --no-privileges \
  --exclude-table=storage.buckets_vectors \
  --exclude-table=storage.vector_indexes \
  > data.sql

test -s roles.sql
test -s schema.sql
test -s data.sql

STAMP="$(date -u +'%Y%m%dT%H%M%SZ')"
YEAR="$(date -u +'%Y')"
MONTH="$(date -u +'%m')"
DAY="$(date -u +'%d')"
ARCHIVE="theouthaven-postgres-${STAMP}.tar.gz"
PREFIX="database/${YEAR}/${MONTH}/${DAY}/${STAMP}"

cd "$WORK_ROOT"
tar -czf "$ARCHIVE" database
SHA256="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
BYTES="$(stat -c '%s' "$ARCHIVE")"
printf '%s  %s\n' "$SHA256" "$ARCHIVE" > "${ARCHIVE}.sha256"

jq -n \
  --arg created_at "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
  --arg archive "$ARCHIVE" \
  --arg sha256 "$SHA256" \
  --arg build_id "${CODEBUILD_BUILD_ID:-unknown}" \
  --arg source_version "${CODEBUILD_RESOLVED_SOURCE_VERSION:-main}" \
  --argjson bytes "$BYTES" \
  '{created_at:$created_at,archive:$archive,sha256:$sha256,bytes:$bytes,aws_codebuild_id:$build_id,source_version:$source_version}' \
  > "${ARCHIVE}.manifest.json"

DEST="s3://${AWS_BACKUP_BUCKET}/${PREFIX}"
aws s3 cp "$ARCHIVE" "${DEST}/${ARCHIVE}" \
  --sse AES256 \
  --only-show-errors \
  --metadata "sha256=${SHA256},codebuild-id=${CODEBUILD_BUILD_ID:-unknown}"
aws s3 cp "${ARCHIVE}.sha256" "${DEST}/${ARCHIVE}.sha256" --sse AES256 --only-show-errors
aws s3 cp "${ARCHIVE}.manifest.json" "${DEST}/${ARCHIVE}.manifest.json" --sse AES256 --only-show-errors

ACTUAL_SHA256="$(aws s3api head-object \
  --bucket "$AWS_BACKUP_BUCKET" \
  --key "${PREFIX}/${ARCHIVE}" \
  --query 'Metadata.sha256' \
  --output text)"

test "$ACTUAL_SHA256" = "$SHA256"
echo "Verified ${DEST}/${ARCHIVE} (${BYTES} bytes)"
