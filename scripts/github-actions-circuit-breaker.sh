#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-check}"
STALE_MINUTES="${GITHUB_BREAKER_STALE_MINUTES:-10}"
MIN_STALE_QUEUED="${GITHUB_BREAKER_MIN_STALE_QUEUED:-3}"
REPO="${GITHUB_REPOSITORY:-DevSoft-Development/roseout}"
API_ROOT="https://api.github.com/repos/$REPO/actions/runs"

python3 - "$MODE" "$STALE_MINUTES" "$MIN_STALE_QUEUED" "$API_ROOT" <<'PY'
import json
import sys
import urllib.request
from datetime import datetime, timezone

mode = sys.argv[1]
stale_minutes = int(sys.argv[2])
min_stale_queued = int(sys.argv[3])
api_root = sys.argv[4]

headers = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "TheOutHaven-AzureDevOps-CircuitBreaker",
}

def get_json(url):
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.load(response)

def parse_time(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))

now = datetime.now(timezone.utc)
reasons = []
github_status_open = False
repo_queue_open = False

try:
    status = get_json("https://www.githubstatus.com/api/v2/components.json")
    actions = [
        c for c in status.get("components", [])
        if c.get("name", "").strip().lower() == "actions"
    ]
    if actions:
        component_status = actions[0].get("status", "unknown")
        if component_status != "operational":
            github_status_open = True
            reasons.append(f"github_status_actions={component_status}")
except Exception as exc:
    reasons.append(f"github_status_unavailable={type(exc).__name__}")

try:
    queued = get_json(api_root + "?status=queued&per_page=100").get("workflow_runs", [])
    running = get_json(api_root + "?status=in_progress&per_page=100").get("workflow_runs", [])

    stale = []
    for run in queued:
        created = run.get("created_at")
        if not created:
            continue
        age = (now - parse_time(created)).total_seconds() / 60
        if age >= stale_minutes:
            stale.append((run.get("id"), run.get("name"), round(age, 1)))

    if len(stale) >= min_stale_queued and len(running) == 0:
        repo_queue_open = True
        reasons.append(
            f"repo_queue_stalled={len(stale)}_stale_queued_no_running"
        )
except Exception as exc:
    reasons.append(f"github_actions_api_unavailable={type(exc).__name__}")

breaker_open = github_status_open or repo_queue_open
state = "OPEN" if breaker_open else "CLOSED"

print(f"GITHUB_CIRCUIT_STATE={state}")
print(f"GITHUB_CIRCUIT_REASON={';'.join(reasons) if reasons else 'healthy'}")

if mode == "require-open" and not breaker_open:
    print("GitHub Actions is healthy enough to remain the primary deployment orchestrator.")
    sys.exit(42)

if mode == "require-closed" and breaker_open:
    print("GitHub Actions circuit is open; Azure DevOps failover remains active.")
    sys.exit(43)
PY
