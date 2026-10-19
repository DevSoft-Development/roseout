#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SRC="$ROOT/tools/azure-devops-mcp/aws"
OUT="${1:-$ROOT/dist/azure-devops-mcp}"
mkdir -p "$OUT"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
cp "$SRC/handler.mjs" "$STAGE/handler.mjs"
cp "$SRC/package.json" "$STAGE/package.json"
(cd "$STAGE" && npm install --omit=dev --ignore-scripts --no-audit --no-fund --package-lock=true)
node --check "$STAGE/handler.mjs"
(cd "$STAGE" && zip -q -r "$OUT/lambda.zip" .)
sha256sum "$OUT/lambda.zip" | tee "$OUT/lambda.zip.sha256"
echo "Built $OUT/lambda.zip; DO NOT deploy until OAuth certification is complete."
