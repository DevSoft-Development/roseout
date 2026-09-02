from pathlib import Path

path = Path('.github/workflows/aws-edge-runtime.yml')
s = path.read_text()


def replace_once(old, new, label):
    global s
    if old not in s:
        raise SystemExit(f'missing expected {label}')
    s = s.replace(old, new, 1)

for line in [
    '          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}\n',
    '          TELNYX_CONCIERGE_API_KEY: ${{ secrets.TELNYX_CONCIERGE_API_KEY }}\n',
    '          TELNYX_TRANSACTIONAL_API_KEY: ${{ secrets.TELNYX_TRANSACTIONAL_API_KEY }}\n',
    '          TELNYX_RESERVATIONS_API_KEY: ${{ secrets.TELNYX_RESERVATIONS_API_KEY }}\n',
    '          TELNYX_CRM_API_KEY: ${{ secrets.TELNYX_CRM_API_KEY }}\n',
    '          TELNYX_SUPPORT_API_KEY: ${{ secrets.TELNYX_SUPPORT_API_KEY }}\n',
    '          TELNYX_MARKETING_API_KEY: ${{ secrets.TELNYX_MARKETING_API_KEY }}\n',
]:
    if line not in s:
        raise SystemExit(f'missing provider secret injection: {line.strip()}')
    s = s.replace(line, '', 1)

replace_once(
    '          AWS_PLATFORM_INTEGRATION_API_SECRET: ${{ secrets.AWS_PLATFORM_INTEGRATION_API_SECRET }}\n',
    '          AWS_PLATFORM_INTEGRATION_API_SECRET: ${{ secrets.AWS_PLATFORM_INTEGRATION_API_SECRET }}\n          AWS_PLATFORM_ASSISTANT_API_SECRET: ${{ secrets.AWS_PLATFORM_ASSISTANT_API_SECRET }}\n',
    'assistant secret env',
)

integration = '''          INTEGRATION_STACK='theouthaven-integration-api-production'\n          AWS_PLATFORM_INTEGRATION_API_URL="$(aws cloudformation describe-stacks --stack-name "$INTEGRATION_STACK" --query "Stacks[0].Outputs[?OutputKey=='IntegrationApiUrl'].OutputValue" --output text)"\n          AWS_PLATFORM_INTEGRATION_API_SHARED_SECRET="${AWS_PLATFORM_INTEGRATION_API_SECRET:-${AWS_PLATFORM_JOB_GATEWAY_SECRET:-}}"\n          test -n "$AWS_PLATFORM_INTEGRATION_API_URL" && test "$AWS_PLATFORM_INTEGRATION_API_URL" != 'None' || { echo "Integration API URL is unavailable" >&2; exit 1; }\n          [[ "$AWS_PLATFORM_INTEGRATION_API_URL" == https://* ]] || { echo "Integration API URL must use HTTPS" >&2; exit 1; }\n          test "${#AWS_PLATFORM_INTEGRATION_API_SHARED_SECRET}" -ge 32 || { echo "Integration API shared secret is missing or too short" >&2; exit 1; }\n          echo "::add-mask::$AWS_PLATFORM_INTEGRATION_API_SHARED_SECRET"\n'''
assistant = integration + '''\n          ASSISTANT_STACK='theouthaven-assistant-api-production'\n          AWS_PLATFORM_ASSISTANT_API_URL=''\n          for _ in $(seq 1 60); do\n            AWS_PLATFORM_ASSISTANT_API_URL="$(aws cloudformation describe-stacks --stack-name "$ASSISTANT_STACK" --query "Stacks[0].Outputs[?OutputKey=='AssistantApiUrl'].OutputValue" --output text 2>/dev/null || true)"\n            if [ -n "$AWS_PLATFORM_ASSISTANT_API_URL" ] && [ "$AWS_PLATFORM_ASSISTANT_API_URL" != 'None' ]; then break; fi\n            sleep 5\n          done\n          AWS_PLATFORM_ASSISTANT_API_SHARED_SECRET="${AWS_PLATFORM_ASSISTANT_API_SECRET:-${AWS_PLATFORM_JOB_GATEWAY_SECRET:-}}"\n          test -n "$AWS_PLATFORM_ASSISTANT_API_URL" && test "$AWS_PLATFORM_ASSISTANT_API_URL" != 'None' || { echo "Assistant API URL is unavailable" >&2; exit 1; }\n          [[ "$AWS_PLATFORM_ASSISTANT_API_URL" == https://* ]] || { echo "Assistant API URL must use HTTPS" >&2; exit 1; }\n          test "${#AWS_PLATFORM_ASSISTANT_API_SHARED_SECRET}" -ge 32 || { echo "Assistant API shared secret is missing or too short" >&2; exit 1; }\n          echo "::add-mask::$AWS_PLATFORM_ASSISTANT_API_SHARED_SECRET"\n'''
replace_once(integration, assistant, 'Assistant stack resolution')

replace_once(
    '            --arg AWS_PLATFORM_INTEGRATION_API_URL "$AWS_PLATFORM_INTEGRATION_API_URL" \\\n            --arg AWS_PLATFORM_INTEGRATION_API_SHARED_SECRET "$AWS_PLATFORM_INTEGRATION_API_SHARED_SECRET" \\\n',
    '            --arg AWS_PLATFORM_INTEGRATION_API_URL "$AWS_PLATFORM_INTEGRATION_API_URL" \\\n            --arg AWS_PLATFORM_INTEGRATION_API_SHARED_SECRET "$AWS_PLATFORM_INTEGRATION_API_SHARED_SECRET" \\\n            --arg AWS_PLATFORM_ASSISTANT_API_URL "$AWS_PLATFORM_ASSISTANT_API_URL" \\\n            --arg AWS_PLATFORM_ASSISTANT_API_SHARED_SECRET "$AWS_PLATFORM_ASSISTANT_API_SHARED_SECRET" \\\n',
    'Assistant jq args',
)

replace_once(
    '              AWS_PLATFORM_INTEGRATION_API_URL:$AWS_PLATFORM_INTEGRATION_API_URL,\n              AWS_PLATFORM_INTEGRATION_API_SECRET:$AWS_PLATFORM_INTEGRATION_API_SHARED_SECRET\n',
    '              AWS_PLATFORM_INTEGRATION_API_URL:$AWS_PLATFORM_INTEGRATION_API_URL,\n              AWS_PLATFORM_INTEGRATION_API_SECRET:$AWS_PLATFORM_INTEGRATION_API_SHARED_SECRET,\n              AWS_PLATFORM_ASSISTANT_API_URL:$AWS_PLATFORM_ASSISTANT_API_URL,\n              AWS_PLATFORM_ASSISTANT_API_SECRET:$AWS_PLATFORM_ASSISTANT_API_SHARED_SECRET\n',
    'Assistant runtime fields',
)

replace_once(
    '''          jq -e '\n            (.AWS_PLATFORM_INTEGRATION_API_URL | strings | startswith("https://"))\n            and (.AWS_PLATFORM_INTEGRATION_API_SECRET | strings | length >= 32)\n          ' "$RUNTIME" >/dev/null\n''',
    '''          jq -e '\n            (.AWS_PLATFORM_INTEGRATION_API_URL | strings | startswith("https://"))\n            and (.AWS_PLATFORM_INTEGRATION_API_SECRET | strings | length >= 32)\n            and (.AWS_PLATFORM_ASSISTANT_API_URL | strings | startswith("https://"))\n            and (.AWS_PLATFORM_ASSISTANT_API_SECRET | strings | length >= 32)\n          ' "$RUNTIME" >/dev/null\n''',
    'Assistant runtime validation',
)

marker = '''          mv "$RUNTIME.tmp" "$RUNTIME"\n\n          if aws secretsmanager describe-secret --secret-id "$RUNTIME_SECRET_NAME" >/dev/null 2>&1; then\n'''
cleanup = '''          mv "$RUNTIME.tmp" "$RUNTIME"\n\n          # Migrated provider credentials must not remain in the Edge runtime secret.\n          jq 'del(\n            .OPENAI_API_KEY,\n            .TELNYX_API_KEY,\n            .TELNYX_CONCIERGE_API_KEY,\n            .TELNYX_TRANSACTIONAL_API_KEY,\n            .TELNYX_RESERVATIONS_API_KEY,\n            .TELNYX_CRM_API_KEY,\n            .TELNYX_SUPPORT_API_KEY,\n            .TELNYX_MARKETING_API_KEY\n          )' "$RUNTIME" > "$RUNTIME.tmp"\n          mv "$RUNTIME.tmp" "$RUNTIME"\n          jq -e 'has("OPENAI_API_KEY") | not' "$RUNTIME" >/dev/null\n          jq -e '[keys[] | select(startswith("TELNYX_") and endswith("_API_KEY"))] | length == 0' "$RUNTIME" >/dev/null\n\n          if aws secretsmanager describe-secret --secret-id "$RUNTIME_SECRET_NAME" >/dev/null 2>&1; then\n'''
replace_once(marker, cleanup, 'provider cleanup')

path.write_text(s)
print('Assistant Edge runtime wiring updated')
