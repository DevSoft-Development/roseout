# TheOutHaven Oregon DR operating model

## Topology

- Primary: Supabase Virginia `ftdsltatyqhtllyyefzp` (`us-east-1`). Normal writable production target.
- Standby: Supabase Oregon `hnhbzynoyrhjndefbwkh` (`us-west-2`). Passive cross-region DR target.
- Scheduler/runtime: the single existing AWS EventBridge Scheduler + Lambda worker stack. Never create a second active scheduler stack.
- Virginia `pg_cron` must remain empty. Oregon's legacy `pg_cron` inventory must remain inactive during normal operation and after promotion.

## Supported database replication choice

Use PostgreSQL logical replication from Virginia to Oregon for the application/database data that must remain near-current.

Why:

1. Supabase Read Replicas are read-only and cannot directly serve Auth, Storage, or Realtime as an independently writable DR project.
2. Supabase documents manual logical replication as the supported route when full control of Postgres logical replication is required.
3. Both TheOutHaven projects run Postgres 17 with `wal_level=logical` and currently expose replication-slot/sender capacity.
4. Virginia remains the only writable primary during normal operation. Oregon must not accept application writes until a controlled promotion.

PITR/daily backups remain a separate backup layer. They are not the continuous Virginia-to-Oregon synchronization mechanism, and database backups do not contain Storage object bytes.

## Database replication contract

Planned publication/subscription names:

- Virginia publication: `theouthaven_dr_publication`
- Oregon subscription: `theouthaven_va_to_or_dr`

Bootstrap must be performed with a dedicated replication connection credential supplied through an encrypted production secret. Do not place database passwords or connection strings in the repository or workflow output.

Logical replication limitations are treated as explicit DR duties:

- DDL is not replicated. Every production schema change must be applied to both projects before it is considered DR-safe.
- Sequences are not continuously replicated. Promotion must synchronize/advance sequences before Oregon accepts writes.
- Storage object bytes are not replicated by PostgreSQL logical replication.
- Auth service configuration is project-level configuration and must be checked separately from `auth` table data.

The first bootstrap must not create a subscription until Virginia/Oregon schema compatibility has been verified. The migration-history mismatch is not a reason to replay historical DDL against Virginia.

## Recovery objectives

Initial operational targets:

- Database RPO: <= 2 minutes for planned promotion, with a preferred steady-state replication lag under 60 seconds.
- Storage RPO: <= 5 minutes once incremental object replication is activated.
- Auth user-data RPO: follows database replication for replicated Auth tables; project-level Auth configuration must remain parity-checked.
- RTO: <= 30 minutes for a controlled operator-initiated failover after Oregon passes all promotion gates.

These are engineering targets until measured by a completed DR exercise. The measured RPO/RTO from the exercise becomes the authoritative value.

## Storage replication model

Use one-way Virginia -> Oregon object replication during normal operation.

Required behavior:

1. Copy new and changed objects from Virginia to the same bucket/path in Oregon.
2. Propagate deletes from Virginia to Oregon only after a protected tombstone/grace interval so an accidental source deletion does not instantly destroy the standby copy.
3. Preserve bucket configuration and object metadata where supported.
4. Verify source/destination object count and total bytes after each reconciliation pass.
5. Run a deeper periodic parity pass that can byte-verify sampled or changed objects.
6. Never run reverse Oregon -> Virginia synchronization while Virginia is primary.

The production scheduler for this job belongs in the existing AWS EventBridge/Lambda runtime, not Supabase cron and not a second Oregon scheduler stack.

During failover, Virginia -> Oregon storage replication is suspended before Oregon accepts writes. During failback, run a controlled Oregon -> Virginia reconciliation once, confirm parity, then restore the normal Virginia -> Oregon direction.

## Auth DR model

Oregon must be independently able to serve Supabase Auth after promotion.

Promotion gates must verify without printing secrets:

- expected providers enabled, including Microsoft/Azure where production requires it;
- site URL and allowed redirects;
- custom SMTP enabled/configured;
- email templates and relevant Auth limits/settings parity;
- expected `auth.users` / identity data parity;
- publishable/service keys exist and are active.

Supabase projects have independent signing/key material. A failover may invalidate existing sessions unless signing configuration is intentionally aligned using a supported Supabase procedure. The DR exercise must explicitly test whether an already-authenticated session survives; otherwise the runbook assumes users may need to sign in again after failover.

## Promotion gates

Oregon is promotable only when all of the following are true:

- Virginia/Oregon projects are healthy enough to inspect, or the incident has an explicit override path documented by the operator.
- Oregon legacy `pg_cron` has 0 active jobs.
- Virginia `pg_cron` has 0 jobs.
- Oregon logical-replication subscription exists and is healthy.
- replication lag is within the approved RPO threshold, or the operator explicitly accepts the measured loss window;
- required application table counts/checks are within expected parity;
- Storage reconciliation is current enough for the Storage RPO;
- Auth readiness checks pass;
- Oregon API health passes;
- AWS worker target change can resolve the Oregon service role without exposing it.

## Controlled failover

1. Record incident/test start time.
2. Stop or quiesce application writes when possible.
3. Suspend Virginia -> Oregon Storage replication/reconciliation writes.
4. Wait for logical replication to catch up to the accepted RPO and record the final lag/LSN state.
5. Synchronize/advance Oregon sequences required by writable application tables.
6. Disable/drop or otherwise detach the Virginia -> Oregon subscription before Oregon becomes writable. Never leave a subscriber applying Virginia changes while Oregon accepts production writes.
7. Reconfirm Oregon cron has 0 active jobs.
8. Switch Vercel production Supabase URL/public key/server-side key references to Oregon using a repeatable workflow.
9. Switch the existing AWS worker runtime target to Oregon using the existing target-switch workflow.
10. Redeploy/recycle runtime components as required by the target switch.
11. Verify Auth login, Storage read/write, database read/write, Realtime/API behavior, and key smoke paths.
12. Verify the 24 existing AWS schedules remain a single scheduler fleet and execute against Oregon.
13. Record promotion completion time and measured RTO.

## Failback

Failback is a data migration, not simply an environment-variable reversal.

1. Repair Virginia and verify platform health.
2. Keep Virginia non-production/non-writable from the application perspective.
3. Establish a controlled Oregon -> Virginia resynchronization path for all data written while Oregon was primary.
4. Reconcile Storage Oregon -> Virginia and verify counts/bytes plus changed-object bytes.
5. Apply any schema changes to both sides and synchronize sequences.
6. Quiesce Oregon writes.
7. Wait for final Oregon -> Virginia data synchronization and confirm parity.
8. Detach reverse replication before Virginia accepts writes.
9. Switch Vercel production back to Virginia.
10. Switch the existing AWS runtime back to Virginia.
11. Verify Auth, Storage, database/API, and scheduled jobs.
12. Restore the normal Virginia -> Oregon replication direction.
13. Confirm Oregon returns to passive standby with 0 active Supabase cron jobs.

## Split-brain rule

At no point may both Virginia and Oregon accept normal production writes. A region must be detached from inbound replication before it becomes the writable primary, and the former primary remains fenced until failback reconciliation is complete.

## DR exercise exit criteria

Do not consider the DR transition complete until a controlled Virginia -> Oregon -> Virginia exercise has:

- passed application/API/Auth/Storage smoke tests in Oregon;
- demonstrated the AWS scheduler/runtime against Oregon without creating a second scheduler stack;
- successfully failed back to Virginia;
- captured actual database and Storage RPO;
- captured actual RTO;
- confirmed Oregon returned to passive synchronization mode.
