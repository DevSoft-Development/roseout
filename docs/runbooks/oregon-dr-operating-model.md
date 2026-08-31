# TheOutHaven Oregon DR operating model

## Topology

- **Primary:** Supabase Virginia `ftdsltatyqhtllyyefzp` (`us-east-1`). Normal writable production target.
- **Standby:** Supabase Oregon `hnhbzynoyrhjndefbwkh` (`us-west-2`). Passive cross-region DR target.
- **Scheduler/runtime:** the single existing AWS EventBridge Scheduler + Lambda worker stack. Never create a second active scheduler stack.
- Virginia `pg_cron` must remain at **0 jobs**.
- Oregon's 25 legacy `pg_cron` jobs remain preserved but **inactive**.

The former East-1 project `TheOutHaven DR Recovery` has been retired. Oregon is the only DR target.

## Three-lane DR architecture

A single replication technology cannot safely provide a writable second Supabase project because Database, Auth, and Storage have different ownership and data-plane behavior.

During normal operation use three one-way Virginia -> Oregon lanes:

1. **Public application database data — PostgreSQL logical replication.**
2. **Supabase Auth data — protected PostgreSQL snapshot synchronization.**
3. **Supabase Storage — Storage API physical object synchronization.**

Supabase Read Replicas are read-only and are not an independently writable Auth/Storage failover project. Supabase owns managed `auth` tables under `supabase_auth_admin`, so Auth stays outside the application publication. SQL replication of `storage.objects` would not replicate underlying bytes, so Storage also stays outside logical replication.

PITR/daily backups remain a separate protection layer.

## Current pre-bootstrap baseline

Read-only checks on 2026-08-31 showed Oregon is not yet promotable:

- Public application dataset: Virginia **342,037 rows**, Oregon **338,149 rows**; fingerprints differ.
- Managed Auth data excluding `auth.schema_migrations`: Virginia **47 rows**, Oregon **121 rows**; fingerprints differ.
- Storage bucket configuration: exact parity at **8 buckets**.
- Storage objects: Virginia **8,140 objects / 3,648,937,211 bytes**; Oregon **8,130 objects / 3,646,181,458 bytes**; ETag/size manifest fingerprints differ.
- Virginia `pg_cron`: **0 jobs**.
- Oregon `pg_cron`: **25 jobs, 0 active**.
- Expected DR publication/subscription has not yet been bootstrapped.

The manual bootstrap workflows close these initial gaps safely. After the baseline is proven, Auth and Storage reconciliation move into the **existing AWS runtime** for steady-state scheduling; no second scheduler stack and no Supabase cron are introduced.

## Lane 1 — public application data

Names:

- Virginia publication: `theouthaven_dr_publication`
- Oregon subscription: `theouthaven_va_to_or_dr`
- Virginia slot: `theouthaven_va_to_or_dr_slot`

The publication contains production `public` application tables, excluding one-time region/storage migration helper tables. It does **not** contain `auth`, `storage`, `cron`, or Supabase migration-history tables.

Bootstrap rules:

1. Verify public schema compatibility.
2. Verify replica identity for every published table.
3. Verify Oregon's reseed cannot cascade outside the public application table set.
4. Verify Virginia cron is empty and Oregon cron is inactive.
5. Generate a dedicated replication credential only inside the protected production workflow and mask it from logs.
6. Prove Oregon can connect to Virginia before clearing passive data.
7. Reseed Oregon public application tables with a PostgreSQL-consistent initial copy.
8. Keep the subscription enabled for continuous Virginia -> Oregon streaming.

Logical replication does not copy DDL or keep sequences synchronized. Every production schema change must remain DR-compatible on both projects, and promotion must synchronize/advance Oregon sequences after writes are quiesced.

The legacy Supabase migration-history mismatch remains separate. Do not replay historical DDL against Virginia just to make migration ledgers match.

## Lane 2 — Auth data

Auth is deliberately outside the logical publication.

Protected Auth synchronization:

1. Verify managed Auth schema and `auth.schema_migrations` parity.
2. Create an ephemeral Virginia export login with RLS-complete read access.
3. Export Auth data with PostgreSQL 17, excluding `auth.schema_migrations`.
4. Capture an Oregon Auth rollback snapshot before replacement.
5. Replace only Oregon Auth data while preserving its managed migration ledger.
6. Verify a whole-Auth row-count/fingerprint summary.
7. Automatically restore the Oregon rollback snapshot if restore or parity fails.
8. Drop the ephemeral source export login and delete temporary snapshots.

The steady-state version belongs in the **existing AWS runtime**, not GitHub cron and not Supabase cron.

Auth readiness also verifies project-level configuration without printing secrets: required providers, site/redirect URLs, SMTP, relevant email/Auth settings, and active client/service keys.

Supabase projects have independent signing/key material. The DR exercise must test whether an already-authenticated session survives promotion; otherwise assume users may need to authenticate again after a regional failover.

## Lane 3 — Storage bytes

Storage replication is physical and one-way Virginia -> Oregon during normal operation.

Required behavior:

1. Require bucket configuration parity.
2. Compare source/target manifests by bucket, object path, **ETag**, and byte size.
3. Copy only missing or physically changed objects.
4. Verify source bytes before upload.
5. Upsert to the identical Oregon bucket/path.
6. Download and verify the Oregon copy after upload.
7. Require exact post-reconciliation counts, bytes, and manifest fingerprints.
8. Never reverse-copy Oregon -> Virginia while Virginia is primary.

### Protected deletes

A source deletion must not immediately destroy the DR copy. The steady-state AWS reconciler must keep a persistent first-seen tombstone:

- first Virginia-missing/Oregon-present observation -> record tombstone only;
- source object returns before grace expiry -> clear tombstone;
- source remains absent after the approved grace interval -> delete from Oregon and verify;
- unresolved delete candidates block promotion if physical parity is ambiguous.

The manual Storage bootstrap copies/replaces bytes but intentionally does not delete a target-only object on first observation. **Automated delete propagation is incomplete until the AWS tombstone/grace reconciler is deployed and verified.**

## Recovery objectives

Initial engineering targets until measured by a full exercise:

- **Public database RPO:** <= 2 minutes; preferred steady-state logical lag < 60 seconds.
- **Auth RPO:** <= 5 minutes after the AWS Auth reconciler is active; final Auth sync mandatory for planned promotion.
- **Storage RPO:** <= 5 minutes after the AWS Storage reconciler is active; final physical parity mandatory for planned promotion.
- **RTO:** <= 30 minutes for controlled failover after all Oregon gates pass.

Measured RPO/RTO from the completed exercise becomes authoritative.

## Promotion gates

Oregon is promotable only when all applicable gates are true:

- Oregon legacy `pg_cron`: 0 active jobs.
- Virginia `pg_cron`: 0 jobs.
- Expected public publication/subscription/slot exists.
- Oregon subscription worker is connected and all subscribed tables are synchronized.
- Logical-replication lag is inside the accepted RPO.
- Public application fingerprint parity passes after writes are quiesced.
- Auth schema/config readiness and final Auth data fingerprint parity pass.
- Storage bucket and physical object manifest parity pass.
- No unresolved protected-delete condition makes Storage parity ambiguous.
- Oregon Supabase API/Auth/Storage health passes.
- AWS worker target-switch preflight can resolve Oregon credentials without exposing them.

## Controlled Virginia -> Oregon failover

1. Record incident/test start time.
2. Confirm failover is intentional or Virginia is sufficiently unhealthy.
3. Quiesce application writes when possible.
4. Pause Auth/Storage reconciliation loops so maintenance does not race cutover.
5. Wait for public logical replication to reach accepted final lag; record LSN/lag.
6. Run final Virginia -> Oregon Auth sync and verify exact parity.
7. Run final Virginia -> Oregon Storage reconciliation and verify physical parity.
8. Synchronize/advance Oregon sequences.
9. Detach Virginia -> Oregon logical replication **before Oregon accepts production writes**.
10. Reconfirm Oregon cron has 0 active jobs.
11. Switch Vercel production Supabase URL/public/server-side key references to Oregon through the controlled workflow.
12. Switch the existing AWS worker runtime target to Oregon.
13. Recycle runtime components as required.
14. Verify database read/write, Auth login, Storage read/write, Realtime/API, and critical application paths.
15. Verify the 24 existing AWS schedules remain one scheduler fleet and operate against Oregon.
16. Record measured RTO/RPO.

## Failback Oregon -> Virginia

Failback is a data migration, not an environment-variable reversal.

1. Repair Virginia and verify platform health.
2. Keep Virginia fenced from production writes.
3. Establish temporary Oregon -> Virginia public-data synchronization for writes made during failover.
4. Synchronize Auth Oregon -> Virginia using the same protected snapshot principles.
5. Reconcile Storage Oregon -> Virginia and byte-verify changes.
6. Apply required schema changes and synchronize sequences.
7. Quiesce Oregon writes.
8. Complete final reverse synchronization and verify parity.
9. Detach reverse replication before Virginia accepts writes.
10. Switch Vercel production and the existing AWS runtime back to Virginia.
11. Verify production database/Auth/Storage/API and scheduled jobs.
12. Re-establish normal Virginia -> Oregon public logical replication.
13. Re-enable normal Virginia -> Oregon Auth/Storage reconciliation.
14. Confirm Oregon is passive and Supabase cron remains inactive.

## Split-brain rule

At no point may both regions accept normal production writes. A region must be detached from inbound replication before it becomes writable, and the former primary remains fenced until reverse synchronization/failback is complete.

## DR exercise exit criteria

Do not consider the DR transition complete until a controlled Virginia -> Oregon -> Virginia exercise has:

- passed application/API/Auth/Storage smoke tests in Oregon;
- demonstrated the existing AWS scheduler/runtime against Oregon without a second scheduler stack;
- successfully failed back to Virginia;
- captured measured public-database, Auth, and Storage RPO;
- captured measured RTO;
- verified no split-brain interval;
- confirmed Oregon returned to passive synchronization mode.
