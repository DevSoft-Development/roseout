#!/usr/bin/env bash
set -euo pipefail

SECRET_ID="/theouthaven/credential-vault/production/supabase"
LEGACY_TOKEN="${LEGACY_SUPABASE_ACCESS_TOKEN:-}"
TOKEN=""

if aws secretsmanager get-secret-value   --secret-id "$SECRET_ID"   --query SecretString   --output text > "$RUNNER_TEMP/supabase-management-vault.json" 2>/dev/null; then
  TOKEN="$(jq -r '.managementAccessToken // empty' "$RUNNER_TEMP/supabase-management-vault.json")"
fi

if [ -z "$TOKEN" ] && [ -n "$LEGACY_TOKEN" ]; then
  TOKEN="$LEGACY_TOKEN"
  echo "Supabase management token is not in Credential Vault; using legacy GitHub secret fallback." >> "$GITHUB_STEP_SUMMARY"
else
  echo "Supabase management token resolved from Credential Vault." >> "$GITHUB_STEP_SUMMARY"
fi

test -n "$TOKEN" || {
  echo "::error::Missing Supabase management access token."
  exit 1
}

echo "::add-mask::$TOKEN"
echo "SUPABASE_ACCESS_TOKEN=$TOKEN" >> "$GITHUB_ENV"
rm -f "$RUNNER_TEMP/supabase-management-vault.json"
