#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path


def replace_in_function(
    text: str,
    function_name: str,
    already_marker: str,
    start_marker: str,
    end_marker: str,
    replacement: str,
) -> str:
    function_marker = f"{function_name}() {{"
    function_start = text.find(function_marker)
    if function_start < 0:
        raise SystemExit(f"Missing function {function_name}; refusing runtime hardening")

    next_function = text.find("\n}\n\n", function_start)
    if next_function < 0:
        raise SystemExit(f"Could not bound function {function_name}; refusing runtime hardening")
    function_end = next_function + 3
    region = text[function_start:function_end]

    if already_marker in region:
        return text

    relative_start = region.find(start_marker)
    if relative_start < 0:
        raise SystemExit(
            f"Missing expected start marker in {function_name}; refusing runtime hardening"
        )
    relative_end = region.find(end_marker, relative_start)
    if relative_end < 0:
        raise SystemExit(
            f"Missing expected end marker in {function_name}; refusing runtime hardening"
        )
    relative_end += len(end_marker)

    new_region = region[:relative_start] + replacement + region[relative_end:]
    return text[:function_start] + new_region + text[function_end:]


def main() -> None:
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "scripts/dr/oregon-failback.sh")
    text = path.read_text()

    vercel_replacement = '''  curl --fail --silent --show-error --header "Authorization: Bearer $VERCEL_TOKEN" \\
    "https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env?teamId=${VERCEL_TEAM_ID}&decrypt=true" > "$TMP/vercel-env-before-failback.json"
  env_type() { jq -r --arg key "$1" '[.envs[]|select(.key==$key and .target==["production"])][0].type // "encrypted"' "$TMP/vercel-env-before-failback.json"; }
  jq -n --arg url "$VIRGINIA_URL" --arg anon "$virginia_anon" --arg service "$virginia_service" \\
    --arg url_type "$(env_type NEXT_PUBLIC_SUPABASE_URL)" --arg anon_type "$(env_type NEXT_PUBLIC_SUPABASE_ANON_KEY)" --arg service_type "$(env_type SUPABASE_SERVICE_ROLE_KEY)" \\
    '[{key:"NEXT_PUBLIC_SUPABASE_URL",value:$url,type:$url_type,target:["production"]},{key:"NEXT_PUBLIC_SUPABASE_ANON_KEY",value:$anon,type:$anon_type,target:["production"]},{key:"SUPABASE_SERVICE_ROLE_KEY",value:$service,type:$service_type,target:["production"]}]' > "$TMP/vercel-env-upsert.json"
  if [ "$(jq '[.envs[]|select(.key=="SUPABASE_URL" and .target==["production"])]|length' "$TMP/vercel-env-before-failback.json")" = '1' ]; then
    legacy_type="$(env_type SUPABASE_URL)"
    jq --arg url "$VIRGINIA_URL" --arg type "$legacy_type" '. + [{key:"SUPABASE_URL",value:$url,type:$type,target:["production"]}]' "$TMP/vercel-env-upsert.json" > "$TMP/vercel-env-upsert2.json"
    mv "$TMP/vercel-env-upsert2.json" "$TMP/vercel-env-upsert.json"
  fi
'''
    text = replace_in_function(
        text,
        "switch_runtime_vercel_to_virginia",
        "env_type()",
        '  jq -n --arg url "$VIRGINIA_URL" --arg anon "$virginia_anon" --arg service "$virginia_service" \'[\n',
        '  ]\' > "$TMP/vercel-env-upsert.json"\n',
        vercel_replacement,
    )

    cleanup_replacement = '''  echo 'reverse_cleanup_stage=slot'
  query_ref "$OREGON_REF" "select pg_drop_replication_slot('${FAILBACK_SLOT}') where exists(select 1 from pg_replication_slots where slot_name='${FAILBACK_SLOT}');" "$TMP/reverse-slot-drop.json"
  echo 'reverse_cleanup_stage=publication'
  query_ref "$OREGON_REF" "drop publication if exists ${FAILBACK_PUBLICATION};" "$TMP/reverse-publication-drop.json"
  query_ref "$OREGON_REF" "select count(*) roles from pg_roles where rolname='${FAILBACK_REPLICATION_ROLE}';" "$TMP/reverse-source-role-state.json"
  test "$(jq -r '.[0].roles' "$TMP/reverse-source-role-state.json")" = '0' -o "$(jq -r '.[0].roles' "$TMP/reverse-source-role-state.json")" = '1'
  if [ "$(jq -r '.[0].roles' "$TMP/reverse-source-role-state.json")" = '1' ]; then
    echo 'reverse_cleanup_stage=source_membership'
    query_ref "$OREGON_REF" "grant ${FAILBACK_REPLICATION_ROLE} to postgres with inherit true, set true;" "$TMP/reverse-source-membership-grant.json"
    query_ref "$OREGON_REF" "select current_user,session_user,pg_has_role(current_user,'${FAILBACK_REPLICATION_ROLE}','USAGE') usage;" "$TMP/reverse-source-membership-proof.json"
    jq -e '.[0].current_user=="postgres" and .[0].session_user=="postgres" and .[0].usage==true' "$TMP/reverse-source-membership-proof.json" >/dev/null || { echo 'Oregon cleanup membership is not inherited by postgres.' >&2; exit 1; }
    echo 'reverse_cleanup_stage=source_owned'
    query_ref "$OREGON_REF" "drop owned by ${FAILBACK_REPLICATION_ROLE};" "$TMP/reverse-source-owned-drop.json"
    query_ref "$OREGON_REF" "revoke ${FAILBACK_REPLICATION_ROLE} from postgres granted by postgres;" "$TMP/reverse-source-membership-revoke.json"
    echo 'reverse_cleanup_stage=source_role'
    query_ref "$OREGON_REF" "drop role ${FAILBACK_REPLICATION_ROLE};" "$TMP/reverse-source-role-drop.json"
  fi
  query_ref "$VIRGINIA_REF" "select count(*) roles from pg_roles where rolname='${FAILBACK_SUBSCRIBER_ROLE}';" "$TMP/reverse-target-role-state.json"
  test "$(jq -r '.[0].roles' "$TMP/reverse-target-role-state.json")" = '0' -o "$(jq -r '.[0].roles' "$TMP/reverse-target-role-state.json")" = '1'
  if [ "$(jq -r '.[0].roles' "$TMP/reverse-target-role-state.json")" = '1' ]; then
    echo 'reverse_cleanup_stage=target_membership'
    query_ref "$VIRGINIA_REF" "grant ${FAILBACK_SUBSCRIBER_ROLE} to postgres with inherit true, set true;" "$TMP/reverse-target-membership-grant.json"
    query_ref "$VIRGINIA_REF" "select current_user,session_user,pg_has_role(current_user,'${FAILBACK_SUBSCRIBER_ROLE}','USAGE') usage;" "$TMP/reverse-target-membership-proof.json"
    jq -e '.[0].current_user=="postgres" and .[0].session_user=="postgres" and .[0].usage==true' "$TMP/reverse-target-membership-proof.json" >/dev/null || { echo 'Virginia cleanup membership is not inherited by postgres.' >&2; exit 1; }
    echo 'reverse_cleanup_stage=target_owned'
    query_ref "$VIRGINIA_REF" "drop owned by ${FAILBACK_SUBSCRIBER_ROLE};" "$TMP/reverse-target-owned-drop.json"
    query_ref "$VIRGINIA_REF" "revoke ${FAILBACK_SUBSCRIBER_ROLE} from postgres granted by postgres;" "$TMP/reverse-target-membership-revoke.json"
    echo 'reverse_cleanup_stage=target_role'
    query_ref "$VIRGINIA_REF" "drop role ${FAILBACK_SUBSCRIBER_ROLE};" "$TMP/reverse-target-role-drop.json"
  fi
  query_ref "$OREGON_REF" "select (select count(*) from pg_replication_slots where slot_name='${FAILBACK_SLOT}') slots,(select count(*) from pg_publication where pubname='${FAILBACK_PUBLICATION}') publications,(select count(*) from pg_roles where rolname='${FAILBACK_REPLICATION_ROLE}') roles;" "$TMP/reverse-source-clean.json"
  query_ref "$VIRGINIA_REF" "select (select count(*) from pg_subscription where subname='${FAILBACK_SUBSCRIPTION}') subscriptions,(select count(*) from pg_roles where rolname='${FAILBACK_SUBSCRIBER_ROLE}') roles;" "$TMP/reverse-target-clean.json"
  jq -e '.[0].slots==0 and .[0].publications==0 and .[0].roles==0' "$TMP/reverse-source-clean.json" >/dev/null
  jq -e '.[0].subscriptions==0 and .[0].roles==0' "$TMP/reverse-target-clean.json" >/dev/null
  echo 'reverse_cleanup=complete'
'''
    cleanup_start = '  query_ref "$OREGON_REF" "select pg_drop_replication_slot(\'${FAILBACK_SLOT}\')'
    cleanup_end = '  query_ref "$VIRGINIA_REF" "drop owned by ${FAILBACK_SUBSCRIBER_ROLE}; drop role if exists ${FAILBACK_SUBSCRIBER_ROLE};" "$TMP/reverse-target-clean.json"\n'
    text = replace_in_function(
        text,
        "detach_reverse_rebuild_forward",
        "reverse_cleanup_stage=publication",
        cleanup_start,
        cleanup_end,
        cleanup_replacement,
    )

    required = (
        "env_type()",
        "legacy_type",
        "reverse_cleanup_stage=publication",
        "reverse_cleanup_stage=source_membership",
        "reverse_cleanup_stage=target_membership",
        "grant ${FAILBACK_REPLICATION_ROLE} to postgres with inherit true, set true",
        "grant ${FAILBACK_SUBSCRIBER_ROLE} to postgres with inherit true, set true",
        "reverse_cleanup=complete",
    )
    missing = [marker for marker in required if marker not in text]
    if missing:
        raise SystemExit(f"Runtime hardening incomplete; missing: {', '.join(missing)}")
    if "drop publication if exists ${FAILBACK_PUBLICATION}; drop owned by ${FAILBACK_REPLICATION_ROLE}" in text:
        raise SystemExit("Unsafe combined reverse cleanup block remains")

    path.write_text(text)


if __name__ == "__main__":
    main()
