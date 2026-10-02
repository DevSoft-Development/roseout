#!/usr/bin/env bash
set -euo pipefail

TARGET_ENV="${1:-production}"
case "$TARGET_ENV" in
  production|staging) ;;
  *) echo "::error::Unsupported registry environment: $TARGET_ENV" >&2; exit 1 ;;
esac

SECRET_ID="/theouthaven/credential-vault/${TARGET_ENV}/supabase"
if ! aws secretsmanager get-secret-value --secret-id "$SECRET_ID" --query SecretString --output text > "$RUNNER_TEMP/platform-release-supabase.json" 2>/dev/null; then
  if [ "$TARGET_ENV" != "production" ]; then
    SECRET_ID="/theouthaven/credential-vault/production/supabase"
    aws secretsmanager get-secret-value --secret-id "$SECRET_ID" --query SecretString --output text > "$RUNNER_TEMP/platform-release-supabase.json"
  else
    exit 1
  fi
fi

SUPABASE_URL="$(jq -r '.url // empty' "$RUNNER_TEMP/platform-release-supabase.json")"
SUPABASE_SECRET_KEY="$(jq -r '.secretKey // empty' "$RUNNER_TEMP/platform-release-supabase.json")"
SUPABASE_SERVICE_ROLE_KEY="$(jq -r '.secretKey // .serviceRoleKey // empty' "$RUNNER_TEMP/platform-release-supabase.json")"
test -n "$SUPABASE_URL"
test -n "$SUPABASE_SERVICE_ROLE_KEY"
echo "::add-mask::$SUPABASE_SERVICE_ROLE_KEY"
[ -z "$SUPABASE_SECRET_KEY" ] || echo "::add-mask::$SUPABASE_SECRET_KEY"
{
  echo "SUPABASE_URL=$SUPABASE_URL"
  echo "SUPABASE_SECRET_KEY=$SUPABASE_SECRET_KEY"
  echo "SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY"
} >> "$GITHUB_ENV"
rm -f "$RUNNER_TEMP/platform-release-supabase.json"
