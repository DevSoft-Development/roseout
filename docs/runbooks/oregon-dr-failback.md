# Oregon DR failback safety model

This runbook defines how TheOutHaven returns production from Oregon to Virginia after an actual Virginia -> Oregon DR promotion.

Failback is not a normal rollback button. Once Oregon has accepted production writes, Virginia is stale and must be recovered from Oregon before Virginia can become authoritative again.

## Normal steady state

- Virginia is the normal writable primary.
- Oregon is the passive standby.
- Public application tables replicate Virginia -> Oregon.
- Auth and physical Storage reconcile Virginia -> Oregon outside logical replication.
- Virginia `pg_cron` remains at 0 jobs.
- Oregon legacy cron remains preserved but inactive.
- Existing cross-project access-token continuity is not guaranteed; the DR session policy remains `reauthentication_required`.

When this normal topology is active, the explicit failback workflow must refuse both preparation and final failback because Oregon is not the production primary.

## Explicit failback workflow

Workflow: `.github/workflows/oregon-dr-failback.yml`

The workflow has two manual phases so most recovery work can happen while Oregon continues serving production.

### Phase 1: `prepare`

Manual inputs:

- action: `prepare`
- confirmation: `PREPARE_FAILBACK`
- `oregon_writes_quiesced` is not required

Preparation is allowed only when all authoritative evidence says Oregon is the active primary:

- `DR_MODE=oregon_primary`
- AWS Edge Runtime targets Oregon
- Vercel production targets Oregon
- all 24 business schedules are enabled
- both forward DR reconciler schedules are disabled
- Virginia `pg_cron=0`
- Oregon active cron=0
- the old Virginia -> Oregon subscriber/worker is gone and the old forward slot is not active
- Virginia remains write-fenced
- Virginia/Oregon writable schema catalogs match

The prepare phase then:

1. Creates or refreshes temporary Oregon source role `theouthaven_dr_failback_replication`.
2. Creates the temporary Oregon publication `theouthaven_failback_publication`.
3. Creates the temporary Oregon slot `theouthaven_or_to_va_failback_slot`.
4. Creates a one-purpose Virginia subscription-owner login `theouthaven_dr_failback_subscriber`.
5. Grants that login only the database/subscription and public-table privileges required for the temporary reverse lane.
6. Reseeds the fenced Virginia `public` application tables from scratch after proving the truncate/cascade boundary is contained inside the DR table set.
7. Creates Virginia subscription `theouthaven_or_to_va_failback` with `copy_data=true`, the pre-created slot, and `run_as_owner=true`.
8. Enables the subscription and waits for every eligible relation to reach `pg_subscription_rel.srsubstate='r'` with one connected worker.

Oregon remains writable and continues serving production during this phase. Logical replication catches any new Oregon public writes after the initial table copy. No traffic switch occurs.

Preparation is intentionally separate from final failback so the longest public-data copy can happen before the outage/quiesce window.

## Phase 2: `failback`

Manual inputs:

- action: `failback`
- `oregon_writes_quiesced=true`
- confirmation: `FAILBACK_VIRGINIA`

Final failback first re-proves the reverse lane is complete. It then enters a fail-closed transition:

1. Disable the 24 business schedules.
2. Change the DR control state to `failback_in_progress`.
3. Bump the Edge Runtime `DR_PRIMARY_EPOCH` so warm Lambda containers cannot continue using a cached Oregon runtime secret.
4. Apply a database-level Oregon write fence to `authenticator`, `supabase_auth_admin`, and `supabase_storage_admin`, and terminate their existing database connections.
5. Prove a quiet Oregon public-write window.
6. Wait for Oregon -> Virginia WAL lag to reach zero.
7. Run the protected reverse Auth reconciliation Oregon -> Virginia.
8. Run protected physical Storage reconciliation Oregon -> Virginia until exact parity. Target-only Storage deletions are allowed only in this final quiesced phase and the reconciler rechecks the Oregon source before each delete.
9. Require exact public-data fingerprints across Oregon and Virginia.
10. Build the Oregon-source / Virginia-target sequence plan and advance Virginia sequences only upward. The safe target is at least the maximum of source sequence state, source table maximum, target sequence state, target table maximum, and sequence start floor.
11. Detach and remove the temporary Oregon -> Virginia subscription, slot, publication, and one-purpose temporary roles.
12. Rebuild the ordinary Virginia -> Oregon public standby lane while both projects are still fenced. Because public parity is exact at this point, the rebuilt subscriber uses `copy_data=false` rather than performing another destructive reseed.
13. Verify the rebuilt Virginia -> Oregon subscriber has one worker and every eligible relation is ready.
14. Point the AWS Edge Runtime secret back to Virginia and set `DR_MODE=virginia_primary`.
15. Bump `DR_PRIMARY_EPOCH` again so warm Lambda containers reload Virginia credentials.
16. Update Vercel production Supabase variables back to Virginia.
17. Remove the Virginia database write fence, making Virginia the only writable project while Oregon remains fenced.
18. Redeploy Vercel production and require the new deployment to reach `READY`.
19. Remove the Oregon API/Auth/Storage role fence only after no application/runtime traffic points to Oregon. This is required so the normal Virginia -> Oregon Auth/Storage reconciler can operate.
20. Run a forward standby health probe and require public/Auth/Storage health.
21. Re-enable all 24 business schedules and then the two isolated Virginia -> Oregon DR schedules.
22. Verify Virginia is authoritative again and Oregon is passive.

## Reverse logical replication contract

Temporary failback lane:

- Oregon publication: `theouthaven_failback_publication`
- Oregon slot: `theouthaven_or_to_va_failback_slot`
- Virginia subscription: `theouthaven_or_to_va_failback`
- Oregon source role: `theouthaven_dr_failback_replication`
- Virginia temporary subscriber role: `theouthaven_dr_failback_subscriber`

The normal Virginia -> Oregon names are never repurposed for reverse replication.

Before Oregon can be a writable primary, the old inbound Virginia -> Oregon subscriber must already be detached. Before Virginia can become writable again, the temporary Oregon -> Virginia subscriber is detached and the normal Virginia -> Oregon lane is rebuilt in the correct direction.

The Oregon source connection uses the direct Postgres host, not Supavisor. The temporary Virginia subscriber login uses the session pooler only to execute subscriber-side administration; the logical-replication source connection embedded in the subscription is still direct to Oregon.

## Sequence rule

Logical replication does not synchronize sequence current values.

For every owned public sequence, final Virginia state must never be lower than:

- Oregon source sequence state,
- Oregon table maximum for the owning column,
- Virginia current sequence state,
- Virginia table maximum for the owning column,
- the sequence start floor.

The workflow uses `scripts/dr/promotion-sequence-state.sql` for both sides and applies only upward-safe `setval` operations. Final state uses `is_called=true` so a subsequent `nextval()` cannot reuse the synchronized value.

## Auth behavior

Auth rows/password hashes are reconciled Oregon -> Virginia in the final quiesced phase. `auth.schema_migrations` remains protected.

Database-row parity does not imply JWT continuity. The established policy remains:

`reauthentication_required`

Customers must be prepared to sign in again. Admins must be prepared to reauthenticate through Microsoft. Do not rotate or copy signing keys merely to make a DR event transparent.

## Storage behavior

`storage.objects` metadata is not the physical object bytes.

Final failback requires Oregon -> Virginia physical object reconciliation with byte verification. The existing reverse reconciler verifies object size and MD5 when applicable. Virginia-only objects are deleted only during the explicitly confirmed, quiesced final failback and only after a fresh Oregon-source existence check.

## Split-brain rules

At no point may both projects accept normal production writes.

- Promotion fences Virginia before Oregon becomes writable.
- Failback fences Oregon before Virginia becomes writable.
- Runtime and Vercel targeting must agree on the same primary.
- The inbound logical subscriber to the active primary must not be active.
- Base schedules are disabled during the final transition.
- The two forward DR reconciler schedules remain disabled while Oregon is primary or a transition is in progress.
- Supabase cron is never reactivated in either region.

## Failure behavior

`prepare` never changes production traffic or Oregon writeability. A failed prepare leaves Virginia non-primary and fenced; the reverse preparation can be diagnosed or resumed without changing the active primary.

Once final failback enters `failback_in_progress`, failures are fail-closed:

- business schedules are kept disabled;
- forward DR schedules are kept disabled;
- the workflow does not attempt an automatic database or traffic rollback;
- operators must use this runbook and observed control state to establish exactly one authoritative writable region before resuming production work.

This is intentional. After the final quiesce boundary, an automatic rollback could create split brain or discard post-promotion data.

## Read-only preflight

`.github/workflows/oregon-dr-failback-preflight.yml` remains the independent read-only diagnostic.

`assess` is safe in normal Virginia-primary production and reports current topology, schema/data/Auth/Storage status, sequence planning, and session strategy.

`failback_preflight` is a hard manual evidence gate requiring:

- Oregon primary confirmed,
- Oregon writes quiesced,
- confirmation `FAILBACK_PREFLIGHT`,
- old forward lane inactive,
- reverse lane present and fully caught up,
- zero reverse WAL lag,
- exact schema/public/Auth/Storage parity,
- safe Virginia sequences,
- working Virginia admin/customer re-login paths.

The preflight itself never changes replication, traffic, sequences, schedulers, or writeability.

## Completion criteria

Failback is complete only when all of the following are true:

- `DR_MODE=virginia_primary`
- AWS Edge Runtime targets Virginia
- Vercel production targets Virginia
- Virginia is writable and Oregon is not receiving application traffic
- Virginia `pg_cron=0`
- Oregon active cron=0
- normal publication `theouthaven_dr_publication` exists
- normal slot `theouthaven_va_to_or_dr_slot` exists and is active
- Oregon subscription `theouthaven_va_to_or_dr` is enabled
- exactly one Oregon subscriber worker is connected
- every current eligible public relation is ready
- Auth parity is exact
- Storage parity is exact
- all 24 business schedules are enabled
- both isolated forward DR schedules are enabled
- session strategy remains documented as `reauthentication_required`
