# Oregon DR reverse Auth + Storage failback reconcile

## Purpose

This runbook covers the protected Oregon -> Virginia reconciliation lanes used only after a real DR promotion has made Oregon the active production primary.

The normal steady-state DR worker remains Virginia -> Oregon. The reverse worker is `dr-failback-reconciler` and is manual-only. It does not create logical-replication objects, switch traffic, change EventBridge schedules, or promote Virginia.

## Safety boundary

A mutating reverse reconcile is blocked unless all of the following are true:

1. The operator explicitly confirms Oregon is primary.
2. The operator explicitly confirms Oregon application writes are quiesced.
3. The workflow receives the exact confirmation phrase `FAILBACK_RECONCILE`.
4. Oregon shows no public writes during an independent five-second observation window.
5. The old Virginia -> Oregon subscription is disabled and has no connected worker.
6. The old Virginia forward slot is not active.
7. The Oregon failback publication and slot exist and the slot is active.
8. Oregon -> Virginia WAL lag is exactly zero.
9. Virginia has exactly one enabled failback subscription and one connected worker.
10. Every eligible public table is subscribed and in `srsubstate='r'`.
11. Virginia `pg_cron` remains empty and Oregon has zero active cron jobs.

A read-only `status` or dry-run operation is safe in the normal Virginia-primary topology. It reports why reverse mutation is not currently eligible.

## Auth lane

The Auth lane uses the same protected snapshot/replace model as steady-state DR, but reverses source and target:

- source: Oregon `auth.*`
- target: Virginia `auth.*`
- `auth.schema_migrations` is preserved
- generated columns are excluded from inserts
- `auth.refresh_tokens_id_seq` is synchronized
- the full target snapshot is retained in memory for rollback
- post-write row fingerprints and sequence state are verified
- verification failure restores the previous Virginia Auth snapshot

This deliberately does not assume that project signing material is identical. Session/signing-key behavior remains a separate failback preflight concern; the reconciler synchronizes Auth database state, not private signing keys.

## Storage lane

The Storage lane also reverses source and target:

- source bytes: Oregon Storage API
- target bytes: Virginia Storage API
- bucket configuration must already match
- missing or changed objects are copied with upsert
- source byte size is checked before upload
- a simple MD5 ETag is verified when available
- target bytes are downloaded after upload and verified again
- objects larger than 64 MiB are blocked by the worker guard
- each invocation copies at most 100 objects

Virginia-only objects are never deleted by default. Exact deletion requires the manual workflow input `delete_target_only=true`, and deletion is allowed only during a fully authorized, quiesced, zero-lag failback. Immediately before each delete, Oregon is queried again to ensure the object has not reappeared. The Virginia Storage metadata is checked after deletion.

## Workflow

Use `.github/workflows/aws-dr-failback-reconcile.yml`.

Operations:

- `status`: read-only Auth + Storage + topology assessment.
- `auth`: reverse Auth assessment or reconcile.
- `storage`: reverse Storage assessment or one reconcile batch.
- `final`: Auth reconcile plus repeated Storage batches until exact parity or a blocker is found.

For any mutating operation set:

- `dry_run=false`
- `oregon_primary_confirmed=true`
- `oregon_writes_quiesced=true`
- `confirmation=FAILBACK_RECONCILE`

Set `delete_target_only=true` only after reviewing that Virginia-only Storage objects are expected stale objects from the Oregon-primary period. The final workflow fails rather than silently deleting them when this input is false.

## Required order for actual failback

1. Oregon is already the active production primary from a controlled DR promotion.
2. Virginia remains fenced from application writes.
3. Disable/detach the old Virginia -> Oregon inbound lane so Oregon cannot receive stale writes.
4. Establish the separate Oregon -> Virginia failback publication, slot, and Virginia subscription.
5. Allow public logical replication to catch up.
6. Quiesce/fence Oregon application writes.
7. Wait for Oregon -> Virginia WAL lag to reach zero and all subscribed relations to be `r`.
8. Run reverse Auth reconcile.
9. Run reverse Storage reconcile until exact parity. Review and explicitly permit Virginia-only object deletion if needed.
10. Run the failback preflight. It must verify public data, schema, sequence, Auth, Storage, session/login, and split-brain safety.
11. Advance Virginia sequences if the sequence plan requires it.
12. Detach the Oregon -> Virginia inbound subscription before Virginia accepts writes.
13. Only then switch runtime/application traffic to Virginia.
14. Smoke DB, Auth, Storage, Realtime, application traffic, Microsoft admin login, and customer login.
15. Rebuild the normal Virginia -> Oregon standby lane and re-enable only the two isolated DR schedules.

## Normal production state

While Virginia is primary, the expected reverse topology is absent. A status run should therefore report reverse topology blockers such as missing failback publication/subscription and an active normal forward lane. This is expected and does not represent a production failure.

Never create an EventBridge schedule for `dr-failback-reconciler`. It is a controlled recovery tool, not a steady-state worker.
