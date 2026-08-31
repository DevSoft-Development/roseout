# Oregon DR failback safety model

This runbook defines how TheOutHaven returns production from Oregon to Virginia after an actual Virginia -> Oregon DR promotion.

It is intentionally not a normal rollback button. Once Oregon has accepted production writes, Virginia is stale and failback becomes a controlled reverse-replication exercise.

## Current steady state

- Virginia is the normal writable primary.
- Oregon is the passive standby.
- Public application tables stream Virginia -> Oregon through logical replication.
- Auth and Storage are reconciled Virginia -> Oregon outside logical replication.
- Virginia `pg_cron` must remain empty.
- Oregon legacy cron remains preserved but inactive.

While this topology is healthy, the `Oregon DR failback preflight` workflow runs in `assess` mode and should classify the topology as `virginia_primary_normal_dr`. No reverse publication, slot, or subscription should exist yet.

## Why failback is not an environment-variable reversal

After Oregon is promoted and begins accepting writes:

1. Virginia no longer has the newest public application data.
2. Virginia sequences can be behind Oregon.
3. Auth rows and password hashes can change on Oregon.
4. Physical Storage objects can change on Oregon.
5. Oregon-issued Supabase JWTs are project-signed and may not be trusted by Virginia.
6. Re-enabling Virginia without fencing Oregon creates split brain.

Therefore failback must be a staged recovery operation.

## Reverse logical replication contract

Use a separate temporary Oregon -> Virginia lane:

- Oregon publication: `theouthaven_failback_publication`
- Oregon slot: `theouthaven_or_to_va_failback_slot`
- Virginia subscription: `theouthaven_or_to_va_failback`

Do not repurpose the steady-state Virginia -> Oregon names.

Before the reverse lane is created, the old inbound Virginia -> Oregon subscription must be disabled/detached and its worker must be gone. Oregon must never accept production writes while an active Virginia -> Oregon subscriber can still apply changes into it.

The reverse lane must cover the complete eligible `public` application-table set and all Virginia subscriber relations must reach `pg_subscription_rel.srsubstate = 'r'`.

## Required failback order

1. Confirm Oregon is the active production primary.
2. Keep Virginia fenced from application writes.
3. Confirm the old Virginia -> Oregon subscriber is disabled/detached and the old slot is not active.
4. Apply any compatible schema/DDL changes to Virginia before reverse data synchronization.
5. Create the temporary Oregon failback publication and slot.
6. Create the Virginia failback subscription using a direct Postgres connection, not Supavisor.
7. Let public data catch up.
8. Reconcile Auth Oregon -> Virginia.
9. Reconcile physical Storage bytes Oregon -> Virginia.
10. Fence/quiesce Oregon application writes.
11. Wait for Oregon -> Virginia WAL lag to reach zero.
12. Require all reverse subscription relations to be `r`.
13. Require exact public-data, Auth, and Storage parity.
14. Compute the Virginia sequence plan using Oregon as source and Virginia as target.
15. Advance Virginia sequences only upward; never lower a Virginia sequence.
16. Re-run the final failback preflight.
17. Disable/detach the temporary Oregon -> Virginia subscription before Virginia accepts writes.
18. Switch AWS runtime and application configuration to Virginia only after the data planes are fenced correctly.
19. Smoke DB, Auth, Storage, Realtime, admin Microsoft sign-in, customer sign-in, and application reads/writes.
20. Keep Oregon fenced until the recovered Virginia primary is confirmed healthy.
21. Rebuild the normal Virginia -> Oregon standby lane from the new Virginia primary.

## Sequence rule

Logical replication does not synchronize sequence current values.

For every owned/identity sequence, the safe Virginia target must be at least the maximum of:

- Oregon source sequence state,
- Oregon table maximum for the owning column,
- Virginia current sequence state,
- Virginia table maximum for the owning column,
- the sequence start floor.

`is_called` semantics matter. If Virginia is at the required value but `is_called = false`, a future `nextval()` can reuse that value. The final sequence sync must preserve uniqueness and must never move a Virginia sequence backward.

The preflight uses `scripts/dr/promotion-sequence-state.sql` for both promotion and failback planning.

## Auth behavior on failback

Database/Auth-row parity does not imply JWT continuity.

The failback diagnostic compares Oregon signing-key trust against Virginia and probes the Virginia Microsoft and customer login paths. If Oregon-issued tokens are not trusted by Virginia, the expected strategy is `reauthentication_required`.

That is acceptable only when:

- Virginia Microsoft/Azure admin OAuth starts successfully, and
- Virginia customer email/password Auth is enabled, and
- final Oregon -> Virginia Auth reconciliation is exact.

Do not promise transparent session continuity unless signing trust is explicitly proven.

## Storage behavior on failback

`storage.objects` metadata is not the physical object bytes.

A real failback requires an explicit Oregon -> Virginia physical Storage reconciliation with byte verification before Virginia can become primary. Target-only deletion behavior must remain conservative; no immediate destructive delete should be introduced simply to make manifests match.

The current steady-state reconciler is intentionally Virginia -> Oregon only. The failback preflight records reverse Auth + Storage reconciliation as a required evidence gate rather than silently assuming it exists.

## Split-brain rules

At no point may both projects accept normal production writes.

- Promotion: Virginia is fenced before Oregon becomes writable.
- Failback: Oregon is fenced before Virginia becomes writable.
- The inbound subscription to the active primary must be disabled/detached before that primary accepts writes.
- Scheduler/runtime targeting must follow the same single-primary rule.
- Supabase cron remains inactive; do not solve failback by reactivating cron in either project.

## Workflow modes

### `assess`

Read-only and safe for PR/push validation.

It reports:

- current topology classification,
- forward/reverse logical-replication inventory,
- writable schema parity,
- public data parity,
- Auth parity/config parity,
- Oregon -> Virginia sequence advance plan,
- expected failback session strategy,
- whether reverse Auth/Storage tooling is still required.

It does not fail merely because the system is currently in the normal Virginia-primary topology.

### `failback_preflight`

Manual hard gate only.

It requires:

- `oregon_primary_confirmed = true`,
- `oregon_writes_quiesced = true`,
- confirmation text `FAILBACK_PREFLIGHT`,
- old Virginia -> Oregon replication inactive,
- reverse Oregon -> Virginia replication fully present and caught up,
- exact schema/data/Auth parity,
- Virginia sequences already safe,
- Virginia admin/customer re-login readiness,
- explicit reverse Auth/Storage reconcile evidence.

The workflow still does not switch traffic, mutate sequences, create/drop replication objects, or promote Virginia.

## After failback

Once Virginia is healthy and authoritative again:

1. remove the temporary Oregon -> Virginia failback lane;
2. recreate/verify the normal Virginia publication and slot;
3. recreate Oregon as the passive subscriber;
4. run final Auth and Storage Virginia -> Oregon reconciliation;
5. verify 462/462 or the current eligible public-table count is ready;
6. verify exactly one connected Oregon subscriber worker;
7. verify Virginia `pg_cron = 0` and Oregon active cron = 0;
8. return the two isolated AWS DR schedules to the normal Virginia -> Oregon direction.

Failback is complete only after the ordinary steady-state DR checks are green again.
