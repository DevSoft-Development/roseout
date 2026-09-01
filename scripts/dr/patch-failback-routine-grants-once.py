from pathlib import Path

script_path = Path("scripts/dr/oregon-failback.sh")
text = script_path.read_text()
marker = "  # postgres already has ADMIN OPTION on the temporary owner role. Add only a\n"
insert = r'''  # Logical replication still evaluates target-side constraints and any replica/
  # always triggers. The disposable apply owner therefore needs routine execution
  # in the application schemas used by those table-side checks. Its password is
  # already cleared, and the role is dropped during reverse-lane cleanup.
  query_ref "$VIRGINIA_REF" \
    "grant usage on schema public, fraud_internal, private to ${FAILBACK_SUBSCRIBER_ROLE}; grant execute on all functions in schema public, fraud_internal, private to ${FAILBACK_SUBSCRIBER_ROLE};" \
    "$TMP/reverse-owner-routine-grants.json"
  query_ref "$VIRGINIA_REF" \
    "select (case when has_schema_privilege('${FAILBACK_SUBSCRIBER_ROLE}','public','USAGE') then 0 else 1 end)+(case when has_schema_privilege('${FAILBACK_SUBSCRIBER_ROLE}','fraud_internal','USAGE') then 0 else 1 end)+(case when has_schema_privilege('${FAILBACK_SUBSCRIBER_ROLE}','private','USAGE') then 0 else 1 end) schema_usage_gaps,(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','fraud_internal','private') and not has_function_privilege('${FAILBACK_SUBSCRIBER_ROLE}',p.oid,'EXECUTE')) routine_execute_gaps;" \
    "$TMP/reverse-owner-routine-contract.json"
  jq -e 'length==1 and .[0].schema_usage_gaps==0 and .[0].routine_execute_gaps==0' "$TMP/reverse-owner-routine-contract.json" >/dev/null || {
    echo 'Virginia reverse subscription owner lacks required application routine privileges.' >&2
    exit 1
  }
'''
if marker not in text:
    raise SystemExit("routine grant insertion marker not found")
if "routine_execute_gaps" not in text:
    text = text.replace(marker, insert + marker, 1)
script_path.write_text(text)

workflow_copy = Path("scripts/dr/oregon-dr-failback.generated.yml")
wf = workflow_copy.read_text()
contract_marker = "          grep -F 'temporary_set_grants==0' scripts/dr/oregon-failback.sh >/dev/null\n"
contract_insert = "          grep -F 'grant execute on all functions in schema public, fraud_internal, private' scripts/dr/oregon-failback.sh >/dev/null\n          grep -F 'schema_usage_gaps==0' scripts/dr/oregon-failback.sh >/dev/null\n          grep -F 'routine_execute_gaps==0' scripts/dr/oregon-failback.sh >/dev/null\n"
if contract_marker not in wf:
    raise SystemExit("workflow routine contract marker not found")
if "routine_execute_gaps==0" not in wf:
    wf = wf.replace(contract_marker, contract_marker + contract_insert, 1)
workflow_copy.write_text(wf)
