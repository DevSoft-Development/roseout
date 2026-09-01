from pathlib import Path

script_path = Path("scripts/dr/oregon-failback.sh")
text = script_path.read_text()

text = text.replace(
    "with (copy_data=true, create_slot=true, slot_name='${FAILBACK_SLOT}', enabled=false, disable_on_error=true, run_as_owner=false);",
    "with (copy_data=true, create_slot=true, slot_name='${FAILBACK_SLOT}', enabled=false, disable_on_error=true, run_as_owner=true);",
)

start_marker = "  # Every replicated public table is expected to be owned by postgres. Transfer\n"
end_marker = "  query_ref \"$OREGON_REF\" \"with c as (select n.nspname||'.'||x.relname rel"
start = text.find(start_marker)
end = text.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit("ownership block markers not found")

new_block = r'''  # Supabase project postgres cannot grant SET ROLE postgres to the temporary
  # subscription owner, so PostgreSQL 17 run_as_owner=false cannot safely switch
  # into the postgres-owned target tables. Keep the temporary owner, give it the
  # narrowly required BYPASSRLS attribute, and run apply as that owner instead.
  # The role must remain LOGIN-capable for the logical apply worker, but its
  # password is cleared immediately after subscription creation so external
  # password authentication cannot use it during the DR window.
  query_ref "$VIRGINIA_REF" \
    "alter role ${FAILBACK_SUBSCRIBER_ROLE} with login noreplication bypassrls password null;" \
    "$TMP/reverse-owner-role.json"
  query_ref "$VIRGINIA_REF" \
    "select r.rolcanlogin,r.rolbypassrls,(a.rolpassword is null) password_cleared from pg_roles r join pg_authid a on a.oid=r.oid where r.rolname='${FAILBACK_SUBSCRIBER_ROLE}';" \
    "$TMP/reverse-owner-prereq.json"
  jq -e 'length==1 and .[0].rolcanlogin==true and .[0].rolbypassrls==true and .[0].password_cleared==true' "$TMP/reverse-owner-prereq.json" >/dev/null || {
    echo 'Virginia reverse subscription owner is not hardened for RLS apply.' >&2
    exit 1
  }
  # postgres already has ADMIN OPTION on the temporary owner role. Add only a
  # short-lived SET membership so the management session can act as the actual
  # subscription owner, normalize the subscription, then remove that grant.
  query_ref "$VIRGINIA_REF" \
    "grant ${FAILBACK_SUBSCRIBER_ROLE} to postgres with inherit false, set true;" \
    "$TMP/reverse-owner-access.json"
  query_ref "$VIRGINIA_REF" \
    "set role ${FAILBACK_SUBSCRIBER_ROLE}; alter subscription ${FAILBACK_SUBSCRIPTION} disable; alter subscription ${FAILBACK_SUBSCRIPTION} set (run_as_owner=true); alter subscription ${FAILBACK_SUBSCRIPTION} enable; reset role;" \
    "$TMP/reverse-subscription-owner.json"
  query_ref "$VIRGINIA_REF" \
    "revoke ${FAILBACK_SUBSCRIBER_ROLE} from postgres granted by postgres;" \
    "$TMP/reverse-owner-enable.json"
  query_ref "$VIRGINIA_REF" \
    "select pg_get_userbyid(s.subowner) subscription_owner,s.subenabled,s.subrunasowner,(select rolcanlogin from pg_roles where rolname='${FAILBACK_SUBSCRIBER_ROLE}') owner_can_login,(select rolbypassrls from pg_roles where rolname='${FAILBACK_SUBSCRIBER_ROLE}') owner_bypassrls,(select rolpassword is null from pg_authid where rolname='${FAILBACK_SUBSCRIBER_ROLE}') password_cleared,(select count(*) from pg_auth_members m where m.roleid=(select oid from pg_roles where rolname='${FAILBACK_SUBSCRIBER_ROLE}') and m.member=(select oid from pg_roles where rolname='postgres') and m.grantor=(select oid from pg_roles where rolname='postgres')) temporary_set_grants from pg_subscription s where s.subname='${FAILBACK_SUBSCRIPTION}';" \
    "$TMP/reverse-owner-contract.json"
  jq -e --arg owner "$FAILBACK_SUBSCRIBER_ROLE" 'length==1 and .[0].subscription_owner==$owner and .[0].subenabled==true and .[0].subrunasowner==true and .[0].owner_can_login==true and .[0].owner_bypassrls==true and .[0].password_cleared==true and .[0].temporary_set_grants==0' "$TMP/reverse-owner-contract.json" >/dev/null || {
    echo 'Virginia reverse subscription ownership normalization failed.' >&2
    exit 1
  }

'''

text = text[:start] + new_block + text[end:]
script_path.write_text(text)

wf_path = Path(".github/workflows/oregon-dr-failback.yml")
wf = wf_path.read_text()
old_checks = """          grep -F 'run_as_owner=false' scripts/dr/oregon-failback.sh >/dev/null
          ! grep -F 'run_as_owner=true' scripts/dr/oregon-failback.sh >/dev/null
          grep -F 'owner to postgres' scripts/dr/oregon-failback.sh >/dev/null
          grep -F 'subrunasowner' scripts/dr/oregon-failback.sh >/dev/null
          grep -F 'postgres_bypassrls' scripts/dr/oregon-failback.sh >/dev/null
          grep -F 'with inherit false, set true' scripts/dr/oregon-failback.sh >/dev/null
          grep -F 'granted by postgres' scripts/dr/oregon-failback.sh >/dev/null
          grep -F 'temporary_set_grants==0' scripts/dr/oregon-failback.sh >/dev/null
"""
new_checks = """          grep -F 'run_as_owner=true' scripts/dr/oregon-failback.sh >/dev/null
          ! grep -F 'run_as_owner=false' scripts/dr/oregon-failback.sh >/dev/null
          grep -F 'password null' scripts/dr/oregon-failback.sh >/dev/null
          grep -F 'rolcanlogin' scripts/dr/oregon-failback.sh >/dev/null
          grep -F 'rolbypassrls' scripts/dr/oregon-failback.sh >/dev/null
          grep -F 'set role ${FAILBACK_SUBSCRIBER_ROLE}' scripts/dr/oregon-failback.sh >/dev/null
          grep -F 'subrunasowner' scripts/dr/oregon-failback.sh >/dev/null
          grep -F 'with inherit false, set true' scripts/dr/oregon-failback.sh >/dev/null
          grep -F 'granted by postgres' scripts/dr/oregon-failback.sh >/dev/null
          grep -F 'temporary_set_grants==0' scripts/dr/oregon-failback.sh >/dev/null
"""
if old_checks not in wf:
    raise SystemExit("workflow contract block not found")
wf_path.write_text(wf.replace(old_checks, new_checks))
