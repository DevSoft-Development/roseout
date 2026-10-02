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
SUPABASE_SERVICE_ROLE_KEY="$(jq -r '.serviceRoleKey // empty' "$RUNNER_TEMP/platform-release-supabase.json")"
test -n "$SUPABASE_URL"
test -n "$SUPABASE_SERVICE_ROLE_KEY"
echo "::add-mask::$SUPABASE_SERVICE_ROLE_KEY"
{
  echo "SUPABASE_URL=$SUPABASE_URL"
  echo "SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY"
} >> "$GITHUB_ENV"
rm -f "$RUNNER_TEMP/platform-release-supabase.json"
