# TheOutHaven Oregon DR operating model

## Topology

- **Primary:** Supabase Virginia `ftdsltatyqhtllyyefzp` (`us-east-1`). Normal writable production target.
- **Standby:** Supabase Oregon `hnhbzynoyrhjndefbwkh` (`us-west-2`). Passive cross-region DR target.
- **Scheduler/runtime:** the single existing AWS EventBridge Scheduler + Lambda worker stack. Never create a second active scheduler stack.
- Virginia `pg_cron` must remain at **0 jobs**.
- Oregon's 25 legacy `pg_cron` jobs remain preserved but **inactive**.

The former East-1 project `TheOutHaven DR Recovery` has been retired. Oregon is the only DR target.

## Supported three-lane DR architecture

A single replication technology cannot safely provide a writable second Supabase project because Supabase Database, Auth, and Storage have different ownership and data-plane behavior.

Use three one-way Virginia -> Oregon synchronization lanes during normal operation:

1. **Public application database data — PostgreSQL logical replication.**
2. **Supabase Auth data — protected PostgreSQL snapshot synchronization.**
3. **Supabase Storage — Storage API physical object synchronization.**

Why:

- Supabase Read Replicas are useful read-only replicas but are not an independently writable Auth/Storage/Realtime failover project.
- PostgreSQL logical replication is appropriate for application tables owned by `postgres`.
- Supabase owns the managed `auth` tables under `supabase_auth_admin`; they stay outside the application publication. Supabase documents database-level Auth migration as the way to preserve users and password hashes between projects.
- SQL replication of `storage.objects` metadata would not copy, replace, or delete the underlying object bytes. Storage therefore stays outside logical replication.

PITR/daily backups remain a separate protection layer. They are not the active Virginia -> Oregon DR synchronization mechanism, and database backups do not contain Storage object bytes.

## Lane 1 — public application database replication

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
6. Prove Oregon can connect to Virginia before clearing any passive data.
7. Reseed Oregon public application tables with a PostgreSQL-consistent initial copy.
8. Keep the subscription enabled for continuous Virginia -> Oregon streaming.

Logical-replication duties:

- **DDL does not replicate.** Production schema changes must remain DR-compatible on both projects.
- **Sequences do not continuously replicate.** Promotion must synchronize/advance Oregon sequences after writes are quiesced and before Oregon becomes writable.
- Monitor source replication-slot lag, subscriber worker health, and `pg_subscription_rel` synchronization state.

The legacy Supabase migration-history mismatch remains a separate maintenance item. Do not replay historical DDL against Virginia merely to make the ledgers look identical.

## Lane 2 — Auth DR synchronization

Auth is deliberately outside the logical publication.

Normal synchronization uses a protected snapshot workflow:

1. Verify the managed Auth schema and `auth.schema_migrations` ledger match between Virginia and Oregon.
2. Create an ephemeral Virginia export login with only the capabilities needed for a complete RLS-bypassing Auth export.
3. Export Auth data with PostgreSQL 17 while excluding `auth.schema_migrations`.
4. Capture an Oregon Auth rollback snapshot before replacement.
5. Replace only Oregon Auth data while preserving Oregon's managed Auth migration ledger.
6. Compare a whole-Auth row-count/fingerprint summary.
7. Automatically restore the Oregon rollback snapshot if restore or parity verification fails.
8. Drop the ephemeral source export login and remove temporary snapshot files.

The scheduled version of this synchronization belongs in the **existing AWS runtime**, not GitHub cron and not Supabase cron.

Auth configuration remains separate from Auth table data. DR readiness must also verify without printing secrets:

- Microsoft/Azure and other required providers;
- site URL and allowed redirects;
- custom SMTP;
- templates and relevant email/Auth limits;
- active publishable and service-role keys.

Supabase projects have independent signing/key material. The DR exercise must test whether an already-authenticated session survives promotion. Unless a supported signing-key alignment procedure is explicitly adopted, assume users may need to authenticate again after a region failover.

## Lane 3 — Storage DR synchronization

Storage replication is physical, one-way Virginia -> Oregon during normal operation.

Required behavior:

1. Require bucket configuration parity.
2. Build source/target manifests from bucket, object path, **ETag**, and byte size.
3. Copy only missing or physically changed objects.
4. Download and verify source bytes before upload.
5. Upsert to the identical Oregon bucket/path.
6. Download and verify the Oregon copy after upload.
7. Compare counts, bytes, and manifest fingerprints after reconciliation.
8. Never reverse-copy Oregon -> Virginia while Virginia is primary.

### Protected deletes

A source deletion must not immediately erase the DR copy. The AWS DR reconciler will maintain a persistent tombstone/first-seen record:

- first observation of a Virginia-missing/Oregon-present object -> record tombstone only;
- object returns before grace expiry -> clear tombstone;
- object remains absent after the approved grace interval -> delete from Oregon and verify deletion;
- promotion is blocked when unresolved deletion candidates make physical parity ambiguous.

The manual Storage workflow therefore copies/replaces bytes but intentionally does not delete a target-only object on first observation.

The continuous version belongs in the existing AWS EventBridge/Lambda runtime.

## Recovery objectives

Initial engineering targets until measured by a full exercise:

- **Public database RPO:** <= 2 minutes; preferred steady-state logical replication lag < 60 seconds.
- **Auth RPO:** <= 5 minutes after the AWS snapshot reconciler is activated; a final Auth sync is mandatory for planned promotion.
- **Storage RPO:** <= 5 minutes after the AWS byte reconciler is activated; final physical parity is mandatory for planned promotion.
- **RTO:** <= 30 minutes for controlled operator-initiated failover after all Oregon promotion gates pass.

Measured RPO/RTO from the completed DR exercise becomes authoritative.

## Promotion gates

Oregon is promotable only when all applicable gates are true:

- Oregon legacy `pg_cron`: 0 active jobs.
- Virginia `pg_cron`: 0 jobs.
- Expected public-data logical publication/subscription/slot exists.
- Oregon subscription worker is connected and all subscribed tables are synchronized.
- Replication lag is inside the accepted RPO, or the incident operator explicitly accepts the measured loss window.
- Public application data parity checks pass after writes are quiesced.
- Auth schema/config readiness passes and Auth data fingerprint parity passes after the final snapshot sync.
- Storage bucket configuration and physical object manifest parity pass after the final byte reconciliation.
- No unresolved protected-delete condition makes Storage parity ambiguous.
- Oregon Supabase API/Auth/Storage health passes.
- AWS worker target-switch preflight can resolve Oregon credentials without exposing them.

## Controlled Virginia -> Oregon failover

1. Record incident/test start time.
2. Confirm failover is intentional or Virginia is sufficiently unhealthy to justify promotion.
3. Quiesce application writes when possible.
4. Pause the Virginia -> Oregon Storage/Auth reconciliation loops so no maintenance job races the cutover.
5. Wait for public logical replication to reach the accepted final lag and record LSN/lag state.
6. Run the final Virginia -> Oregon Auth snapshot sync and verify exact Auth data parity.
7. Run the final Virginia -> Oregon Storage byte reconciliation and verify physical parity.
8. Synchronize/advance Oregon sequences required by writable public tables.
9. Disable/drop or otherwise detach the Virginia -> Oregon subscription **before Oregon accepts production writes**.
10. Reconfirm Oregon cron has 0 active jobs.
11. Switch Vercel production Supabase URL/public key/server-side references to Oregon through the controlled workflow.
12. Switch the existing AWS worker runtime target to Oregon.
13. Recycle runtime components as required by the target switch.
14. Verify database read/write, Auth login, Storage read/write, Realtime/API behavior, and critical application smoke paths.
15. Verify the 24 existing AWS schedules remain a single scheduler fleet and operate against Oregon.
16. Record promotion completion time and measured RTO/RPO.

## Failback Oregon -> Virginia

Failback is a data migration, not an environment-variable reversal.

1. Repair Virginia and verify platform health.
2. Keep Virginia fenced from production writes.
3. Establish a controlled temporary Oregon -> Virginia public-data synchronization path for data written while Oregon was primary.
4. Synchronize Auth Oregon -> Virginia using the same protected snapshot principles.
5. Reconcile Storage Oregon -> Virginia and byte-verify changed objects.
6. Apply any required schema changes to both sides and synchronize sequences.
7. Quiesce Oregon writes.
8. Complete final reverse data/Auth/Storage synchronization and verify parity.
9. Detach reverse replication before Virginia accepts writes.
10. Switch Vercel production back to Virginia.
11. Switch the existing AWS runtime back to Virginia.
12. Verify production database/Auth/Storage/API and scheduled jobs.
13. Re-establish the normal Virginia -> Oregon public logical subscription.
14. Re-enable the normal Virginia -> Oregon Auth/Storage reconciliation direction.
15. Confirm Oregon is passive and all Supabase cron jobs remain inactive.

## Split-brain rule

At no point may both Virginia and Oregon accept normal production writes. A region must be detached from inbound replication before it becomes writable, and the former primary stays fenced until reverse synchronization/failback is complete.

## DR exercise exit criteria

Do not consider the DR transition complete until one controlled Virginia -> Oregon -> Virginia exercise has:

- passed application/API/Auth/Storage smoke tests in Oregon;
- demonstrated the existing AWS scheduler/runtime against Oregon without creating a second scheduler stack;
- successfully failed back to Virginia;
- captured measured public-database, Auth, and Storage RPO;
- captured measured RTO;
- verified no split-brain interval occurred;
- confirmed Oregon returned to passive synchronization mode.
