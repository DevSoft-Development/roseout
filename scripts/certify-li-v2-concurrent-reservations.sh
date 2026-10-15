#!/usr/bin/env bash
# Run ONLY against a disposable PostgreSQL database with the LI V2 ledger migration.
# Requires: psql, PG_URL pointing to disposable DB, no production credentials.
set -euo pipefail
: "${LI_V2_CERT_DISPOSABLE_DB:?set LI_V2_CERT_DISPOSABLE_DB=YES for a disposable database}"
[[ "$LI_V2_CERT_DISPOSABLE_DB" == "YES" ]] || { echo "Disposable DB acknowledgement required"; exit 1; }
: "${PG_URL:?PG_URL must point to disposable PostgreSQL}"
[[ "$PG_URL" != *"ftdsltatyqhtllyyefzp"* && "$PG_URL" != *"hnhbzynoyrhjndefbwkh"* ]] || { echo "Refusing known production/DR projects"; exit 1; }
key="li-v2-concurrency-cert-$$"
psql "$PG_URL" -v ON_ERROR_STOP=1 -q <<SQL
insert into private.location_acquisition_budget_caps(scope,scope_id,period_start,period_end,cap_usd,enabled)
values('global','all',now()-interval '1 minute',now()+interval '5 minutes',0.03,true);
SQL
cleanup() {
 psql "$PG_URL" -v ON_ERROR_STOP=1 -q -c "delete from private.location_acquisition_usage where event_key like '$key%'; delete from private.location_acquisition_budget_caps where scope='global' and scope_id='all';" || true
}
trap cleanup EXIT
tmpdir="$(mktemp -d)"
trap 'cleanup; rm -rf "$tmpdir"' EXIT
for i in 1 2 3 4 5; do
  (psql "$PG_URL" -v ON_ERROR_STOP=1 -At -c "select public.reserve_location_acquisition_spend('$key-$i','dataforseo','discovery',0.02);" > "$tmpdir/$i") &
done
wait
granted="$(grep -l '^t$' "$tmpdir"/[1-5] | wc -l | tr -d ' ')"
denied="$(grep -l '^f$' "$tmpdir"/[1-5] | wc -l | tr -d ' ')"
[[ "$granted" == "1" && "$denied" == "4" ]] || { echo "FAIL: granted=$granted denied=$denied"; exit 1; }
echo "PASS: five independent sessions, one permitted, four denied, no overspend"
