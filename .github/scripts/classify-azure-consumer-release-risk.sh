#!/usr/bin/env bash
set -euo pipefail

base_ref="${1:-}"
head_ref="${2:-HEAD}"

if [ -z "$base_ref" ]; then
  echo "risk=high"
  echo "reason=missing_base_ref"
  exit 0
fi

mapfile -t changed < <(git diff --name-only "$base_ref" "$head_ref")

if [ "${#changed[@]}" -eq 0 ]; then
  echo "risk=high"
  echo "reason=no_changed_files_detected"
  exit 0
fi

is_low_risk_path() {
  case "$1" in
    public/*|components/*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

is_high_risk_path() {
  case "$1" in
    infra/azure/*|package.json|package-lock.json|tsconfig.json|packages/*)
      return 0
      ;;
    .github/workflows/azure-consumer-production.yml|.github/scripts/rollout-azure-consumer-canary.sh|.github/scripts/write-platform-release.sh|.github/scripts/prove-azure-frontdoor.py|.github/scripts/classify-azure-consumer-release-risk.sh)
      return 0
      ;;
    lib/auth/*|lib/security/*|lib/payments/*|lib/reserve/*|lib/database/*|lib/db/*)
      return 0
      ;;
    apps/consumer/app/api/auth/*|apps/consumer/app/api/payments/*|apps/consumer/app/api/reservations/*|apps/consumer/app/api/admin/*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

all_low=true
for file in "${changed[@]}"; do
  if is_high_risk_path "$file"; then
    echo "risk=high"
    echo "reason=high_risk_path:$file"
    exit 0
  fi
  if ! is_low_risk_path "$file"; then
    all_low=false
  fi
done

if [ "$all_low" = true ]; then
  echo "risk=low"
  echo "reason=static_or_component_only"
else
  echo "risk=medium"
  echo "reason=application_or_search_change"
fi
