#!/usr/bin/env bash
set -euo pipefail

JOB="${OPS_JOB:-${1:-}}"
ROOT="${REPO_ROOT:-$(pwd)}"
export REPO_ROOT="$ROOT"

case "$JOB" in
  database-backup)
    exec bash "$ROOT/infra/aws/ops/database-backup.sh"
    ;;
  storage-backup)
    exec bash "$ROOT/infra/aws/ops/storage-backup.sh"
    ;;
  worker-reliability-soak)
    exec bash "$ROOT/infra/aws/ops/worker-reliability-soak.sh"
    ;;
  search-ml-train-evaluate-promote)
    exec bash "$ROOT/infra/aws/ops/search-ml-train-evaluate-promote.sh"
    ;;
  *)
    echo "Unsupported AWS ops scheduled job: ${JOB:-<empty>}" >&2
    exit 64
    ;;
esac
