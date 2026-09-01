from pathlib import Path

script_path = Path('scripts/dr/oregon-failback.sh')
text = script_path.read_text()

old = '''verify_oregon_primary_start() {
  test "$(aws sts get-caller-identity --query Account --output text)" = "$AWS_ACCOUNT_ID"
  aws secretsmanager get-secret-value --secret-id "$DR_SECRET_NAME" --query SecretString --output text > "$TMP/dr-start.json"
  jq -e '.DR_MODE=="oregon_primary"' "$TMP/dr-start.json" >/dev/null || {
    echo 'Failback is not applicable unless Oregon is the active primary.' >&2
    exit 1
  }
'''
new = '''verify_oregon_primary_start() {
  local recovery="${1:-false}"
  test "$(aws sts get-caller-identity --query Account --output text)" = "$AWS_ACCOUNT_ID"
  aws secretsmanager get-secret-value --secret-id "$DR_SECRET_NAME" --query SecretString --output text > "$TMP/dr-start.json"
  if [ "$recovery" = 'true' ]; then
    jq -e '.DR_MODE=="failback_in_progress"' "$TMP/dr-start.json" >/dev/null || {
      echo 'Fail-closed recovery requires DR_MODE=failback_in_progress.' >&2
      exit 1
    }
  else
    jq -e '.DR_MODE=="oregon_primary"' "$TMP/dr-start.json" >/dev/null || {
      echo 'Failback is not applicable unless Oregon is the active primary.' >&2
      exit 1
    }
  fi
'''
if old not in text:
    raise SystemExit('verify start header marker not found')
text = text.replace(old, new, 1)

old = '''  test "$(verify_manifest_state "$BASE_MANIFEST" ENABLED)" = '24'
  test "$(verify_manifest_state "$DR_MANIFEST" DISABLED)" = '2'
'''
new = '''  if [ "$recovery" = 'true' ]; then
    test "$(verify_manifest_state "$BASE_MANIFEST" DISABLED)" = '24'
    test "$(verify_manifest_state "$DR_MANIFEST" DISABLED)" = '2'
  else
    test "$(verify_manifest_state "$BASE_MANIFEST" ENABLED)" = '24'
    test "$(verify_manifest_state "$DR_MANIFEST" DISABLED)" = '2'
  fi
'''
if old not in text:
    raise SystemExit('manifest marker not found')
text = text.replace(old, new, 1)

old = '''  jq -e '.[0].active_cron_jobs==0 and .[0].forward_subscriptions==0 and .[0].enabled_forward_subscriptions==0 and .[0].forward_workers==0 and .[0].database_fences==0 and .[0].dr_pre_request_configured==1' "$TMP/oregon-start.json" >/dev/null || {
    echo 'Old Virginia to Oregon logical replication is not fully detached.' >&2
    exit 1
  }
'''
new = '''  if [ "$recovery" = 'true' ]; then
    jq -e '.[0].active_cron_jobs==0 and .[0].forward_subscriptions==0 and .[0].enabled_forward_subscriptions==0 and .[0].forward_workers==0 and .[0].database_fences==1 and .[0].dr_pre_request_configured==1' "$TMP/oregon-start.json" >/dev/null || {
      echo 'Fail-closed recovery requires Oregon fenced with the old forward lane detached.' >&2
      exit 1
    }
  else
    jq -e '.[0].active_cron_jobs==0 and .[0].forward_subscriptions==0 and .[0].enabled_forward_subscriptions==0 and .[0].forward_workers==0 and .[0].database_fences==0 and .[0].dr_pre_request_configured==1' "$TMP/oregon-start.json" >/dev/null || {
      echo 'Old Virginia to Oregon logical replication is not fully detached.' >&2
      exit 1
    }
  fi
'''
if old not in text:
    raise SystemExit('oregon start contract marker not found')
text = text.replace(old, new, 1)

old = '''main() {
  local action="${1:-}" confirmation="${CONFIRMATION:-}" quiesced="${OREGON_WRITES_QUIESCED:-false}"
'''
new = '''main() {
  local action="${1:-}" confirmation="${CONFIRMATION:-}" quiesced="${OREGON_WRITES_QUIESCED:-false}" recovery="${FAIL_CLOSED_RECOVERY:-false}"
'''
if old not in text:
    raise SystemExit('main local marker not found')
text = text.replace(old, new, 1)

old = '''    prepare)
      test "$confirmation" = 'PREPARE_FAILBACK' || { echo 'Prepare requires PREPARE_FAILBACK.' >&2; exit 1; }
      ;;
    failback)
      test "$confirmation" = 'FAILBACK_VIRGINIA' || { echo 'Final failback requires FAILBACK_VIRGINIA.' >&2; exit 1; }
      test "$quiesced" = 'true' || { echo 'Final failback requires OREGON_WRITES_QUIESCED=true.' >&2; exit 1; }
      ;;
'''
new = '''    prepare)
      test "$recovery" = 'false' || { echo 'Prepare does not support fail-closed recovery mode.' >&2; exit 1; }
      test "$confirmation" = 'PREPARE_FAILBACK' || { echo 'Prepare requires PREPARE_FAILBACK.' >&2; exit 1; }
      ;;
    failback)
      if [ "$recovery" = 'true' ]; then
        test "$confirmation" = 'RECOVER_FAILBACK_VIRGINIA' || { echo 'Fail-closed recovery requires RECOVER_FAILBACK_VIRGINIA.' >&2; exit 1; }
      else
        test "$confirmation" = 'FAILBACK_VIRGINIA' || { echo 'Final failback requires FAILBACK_VIRGINIA.' >&2; exit 1; }
      fi
      test "$quiesced" = 'true' || { echo 'Final failback requires OREGON_WRITES_QUIESCED=true.' >&2; exit 1; }
      ;;
'''
if old not in text:
    raise SystemExit('case marker not found')
text = text.replace(old, new, 1)

old = '''  verify_oregon_primary_start
  resolve_project_keys
'''
new = '''  verify_oregon_primary_start "$recovery"
  resolve_project_keys
'''
if old not in text:
    raise SystemExit('verify call marker not found')
text = text.replace(old, new, 1)
script_path.write_text(text)

workflow_path = Path('.github/workflows/oregon-dr-failback.yml')
wf = workflow_path.read_text()
old = '''      confirmation:
        description: PREPARE_FAILBACK for prepare, FAILBACK_VIRGINIA for final failback
        type: string
        required: true
        default: ''
'''
new = '''      confirmation:
        description: PREPARE_FAILBACK, FAILBACK_VIRGINIA, or RECOVER_FAILBACK_VIRGINIA for guarded fail-closed recovery
        type: string
        required: true
        default: ''
      fail_closed_recovery:
        description: Resume a previously fail-closed final failback; requires RECOVER_FAILBACK_VIRGINIA
        type: boolean
        required: true
        default: false
'''
if old not in wf:
    raise SystemExit('workflow input marker not found')
wf = wf.replace(old, new, 1)
old = '''          OREGON_WRITES_QUIESCED: ${{ github.event.inputs.oregon_writes_quiesced }}
        run: bash scripts/dr/oregon-failback.sh '${{ github.event.inputs.action }}'
'''
new = '''          OREGON_WRITES_QUIESCED: ${{ github.event.inputs.oregon_writes_quiesced }}
          FAIL_CLOSED_RECOVERY: ${{ github.event.inputs.fail_closed_recovery || 'false' }}
        run: bash scripts/dr/oregon-failback.sh '${{ github.event.inputs.action }}'
'''
if old not in wf:
    raise SystemExit('workflow env marker not found')
wf = wf.replace(old, new, 1)
contract = "          grep -F 'FAILBACK_VIRGINIA' scripts/dr/oregon-failback.sh >/dev/null\n"
insert = "          grep -F 'RECOVER_FAILBACK_VIRGINIA' scripts/dr/oregon-failback.sh >/dev/null\n          grep -F 'FAIL_CLOSED_RECOVERY' scripts/dr/oregon-failback.sh >/dev/null\n          grep -F 'failback_in_progress' scripts/dr/oregon-failback.sh >/dev/null\n"
if contract not in wf:
    raise SystemExit('workflow contract marker not found')
wf = wf.replace(contract, contract + insert, 1)
workflow_path.write_text(wf)

marker_path = Path('.github/drills/oregon-failback-recovery-2026-09-01.json')
marker_path.write_text('''{\n  "recovery_id": "oregon-failback-recovery-2026-09-01",\n  "approved": true,\n  "required_start_state": "fail_closed_reverse_ready",\n  "expected_final_primary": "virginia"\n}\n''')

recovery = r'''name: Oregon DR failback recovery once

on:
  pull_request:
    paths:
      - '.github/workflows/oregon-dr-failback-recovery-once.yml'
      - '.github/drills/oregon-failback-recovery-2026-09-01.json'
      - '.github/workflows/oregon-dr-failback.yml'
      - 'scripts/dr/oregon-failback.sh'
  push:
    branches: [main]
    paths:
      - '.github/workflows/oregon-dr-failback-recovery-once.yml'
      - '.github/drills/oregon-failback-recovery-2026-09-01.json'

permissions:
  contents: read
  actions: write

concurrency:
  group: oregon-dr-failback-recovery-once
  cancel-in-progress: false

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Validate recovery contract
        run: |
          set -euo pipefail
          marker='.github/drills/oregon-failback-recovery-2026-09-01.json'
          jq -e '.recovery_id=="oregon-failback-recovery-2026-09-01" and .approved==true and .required_start_state=="fail_closed_reverse_ready" and .expected_final_primary=="virginia"' "$marker" >/dev/null
          command -v gh >/dev/null
          bash -n scripts/dr/oregon-failback.sh
          grep -F 'RECOVER_FAILBACK_VIRGINIA' scripts/dr/oregon-failback.sh >/dev/null
          grep -F 'FAIL_CLOSED_RECOVERY' scripts/dr/oregon-failback.sh >/dev/null
          grep -F 'reverse-detach-owner-contract.json' scripts/dr/oregon-failback.sh >/dev/null
          grep -F 'fail_closed_recovery:' .github/workflows/oregon-dr-failback.yml >/dev/null

  recover:
    needs: validate
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    timeout-minutes: 180
    steps:
      - uses: actions/checkout@v4
      - name: Resume guarded final failback
        env:
          GH_TOKEN: ${{ github.token }}
          GH_REPO: ${{ github.repository }}
        run: |
          set -euo pipefail
          dispatch_and_wait() {
            local workflow="$1"
            shift
            local before new_id status conclusion
            before="$(gh run list --repo "$GH_REPO" --workflow "$workflow" --event workflow_dispatch --branch main --limit 1 --json databaseId --jq '.[0].databaseId // 0')"
            gh workflow run "$workflow" --repo "$GH_REPO" --ref main "$@"
            new_id=''
            for _ in $(seq 1 60); do
              new_id="$(gh run list --repo "$GH_REPO" --workflow "$workflow" --event workflow_dispatch --branch main --limit 1 --json databaseId --jq '.[0].databaseId // 0')"
              if [ -n "$new_id" ] && [ "$new_id" != '0' ] && [ "$new_id" != "$before" ]; then break; fi
              sleep 2
            done
            test -n "$new_id" && [ "$new_id" != '0' ] && [ "$new_id" != "$before"
            echo "$workflow=$new_id" >> "$RUNNER_TEMP/recovery-runs.txt"
            gh run watch "$new_id" --repo "$GH_REPO" --exit-status
            status="$(gh run view "$new_id" --repo "$GH_REPO" --json status --jq '.status')"
            conclusion="$(gh run view "$new_id" --repo "$GH_REPO" --json conclusion --jq '.conclusion')"
            test "$status" = 'completed' && test "$conclusion" = 'success'
          }

          : > "$RUNNER_TEMP/recovery-runs.txt"
          dispatch_and_wait oregon-dr-failback.yml \
            -f action=failback \
            -f oregon_writes_quiesced=true \
            -f fail_closed_recovery=true \
            -f confirmation=RECOVER_FAILBACK_VIRGINIA

          curl --fail --location --silent --show-error --retry 6 --retry-delay 5 --max-time 30 https://theouthaven.com/ >/dev/null
          curl --fail --location --silent --show-error --retry 6 --retry-delay 5 --max-time 30 https://theouthaven.com/create >/dev/null

          dispatch_and_wait oregon-dr-readiness.yml -f mode=promotion_preflight

      - name: Recovery summary
        if: always()
        run: |
          {
            echo '### Oregon DR failback recovery'
            echo ''
            if [ -s "$RUNNER_TEMP/recovery-runs.txt" ]; then
              while IFS= read -r line; do echo "- \`$line\`"; done < "$RUNNER_TEMP/recovery-runs.txt"
            fi
            echo ''
            echo "- Result: ${{ job.status }}"
            echo '- Expected final topology: Virginia primary, Oregon passive standby.'
          } >> "$GITHUB_STEP_SUMMARY"
'''
Path('.github/workflows/oregon-dr-failback-recovery-once.yml').write_text(recovery)
