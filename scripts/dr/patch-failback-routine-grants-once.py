from pathlib import Path

script_path = Path("scripts/dr/oregon-failback.sh")
text = script_path.read_text()

# Preserve the routine grants needed by the disposable PostgreSQL 17 apply owner.
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

# The reverse subscription is deliberately owned by the disposable apply role.
# Final detach must therefore act as that owner. Keep the SET membership and
# detach/drop/revoke in one Management API transaction so a failure cannot leave
# a persistent postgres -> subscriber SET ROLE grant behind.
old_detach = r'''  query_ref "$VIRGINIA_REF" "alter subscription ${FAILBACK_SUBSCRIPTION} disable; alter subscription ${FAILBACK_SUBSCRIPTION} set (slot_name = NONE); drop subscription ${FAILBACK_SUBSCRIPTION};" "$TMP/reverse-drop.json"
'''
new_detach = r'''  query_ref "$VIRGINIA_REF" \
    "select pg_get_userbyid(subowner) owner from pg_subscription where subname='${FAILBACK_SUBSCRIPTION}';" \
    "$TMP/reverse-detach-owner.json"
  test "$(jq -r '.[0].owner // empty' "$TMP/reverse-detach-owner.json")" = "$FAILBACK_SUBSCRIBER_ROLE" || {
    echo 'Reverse subscription owner changed before detach.' >&2
    exit 1
  }
  query_ref "$VIRGINIA_REF" \
    "grant ${FAILBACK_SUBSCRIBER_ROLE} to postgres with inherit false, set true; set role ${FAILBACK_SUBSCRIBER_ROLE}; alter subscription ${FAILBACK_SUBSCRIPTION} disable; alter subscription ${FAILBACK_SUBSCRIPTION} set (slot_name = NONE); drop subscription ${FAILBACK_SUBSCRIPTION}; reset role; revoke ${FAILBACK_SUBSCRIBER_ROLE} from postgres granted by postgres;" \
    "$TMP/reverse-drop.json"
  query_ref "$VIRGINIA_REF" \
    "select count(*) temporary_set_grants from pg_auth_members m where m.roleid=(select oid from pg_roles where rolname='${FAILBACK_SUBSCRIBER_ROLE}') and m.member=(select oid from pg_roles where rolname='postgres') and m.grantor=(select oid from pg_roles where rolname='postgres');" \
    "$TMP/reverse-detach-owner-contract.json"
  jq -e 'length==1 and .[0].temporary_set_grants==0' "$TMP/reverse-detach-owner-contract.json" >/dev/null || {
    echo 'Temporary reverse-detach SET ROLE grant was not removed.' >&2
    exit 1
  }
'''
if "reverse-detach-owner-contract.json" not in text:
    if old_detach not in text:
        raise SystemExit("reverse detach replacement marker not found")
    text = text.replace(old_detach, new_detach, 1)
script_path.write_text(text)

workflow_copy = Path("scripts/dr/oregon-dr-failback.generated.yml")
wf = workflow_copy.read_text()
contract_marker = "          grep -F 'temporary_set_grants==0' scripts/dr/oregon-failback.sh >/dev/null\n"
contract_insert = "          grep -F 'grant execute on all functions in schema public, fraud_internal, private' scripts/dr/oregon-failback.sh >/dev/null\n          grep -F 'schema_usage_gaps==0' scripts/dr/oregon-failback.sh >/dev/null\n          grep -F 'routine_execute_gaps==0' scripts/dr/oregon-failback.sh >/dev/null\n"
if contract_marker not in wf:
    raise SystemExit("workflow routine contract marker not found")
if "routine_execute_gaps==0" not in wf:
    wf = wf.replace(contract_marker, contract_marker + contract_insert, 1)

detach_contract_marker = "          grep -F 'routine_execute_gaps==0' scripts/dr/oregon-failback.sh >/dev/null\n"
detach_contract_insert = "          grep -F 'reverse-detach-owner.json' scripts/dr/oregon-failback.sh >/dev/null\n          grep -F 'reverse-detach-owner-contract.json' scripts/dr/oregon-failback.sh >/dev/null\n          grep -F 'Temporary reverse-detach SET ROLE grant was not removed.' scripts/dr/oregon-failback.sh >/dev/null\n"
if detach_contract_marker not in wf:
    raise SystemExit("workflow detach contract marker not found")
if "reverse-detach-owner-contract.json" not in wf:
    wf = wf.replace(detach_contract_marker, detach_contract_marker + detach_contract_insert, 1)
workflow_copy.write_text(wf)
