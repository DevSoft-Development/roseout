# Oregon DR promotion preflight

Virginia remains the normal writable primary. Oregon remains a passive standby until the explicit promotion workflow detaches inbound replication and switches production targets.

## Purpose

Logical replication does not synchronize sequence state. A standby can have fully replicated rows while its local `nextval()` position is still far behind the data. Promoting that standby without advancing its sequences can cause duplicate-key failures immediately after writes begin.

The `Oregon DR promotion preflight` workflow closes that gap without promoting Oregon.

## Modes

### `assess`

Read-only. This is also the mode used automatically for pull requests and pushes that change the preflight contracts.

It checks:

- Virginia `pg_cron` is empty.
- Oregon `pg_cron` has no active jobs.
- The expected publication, slot, subscription, and worker are present.
- Publication and subscription membership exactly cover the eligible public application tables.
- Every Oregon subscribed relation is ready.
- The Oregon subscription is the only PostgreSQL subscription and points to the expected slot/publication contract.
- Writable catalog parity passes through `scripts/dr/writable-catalog.sql`.
- Logical WAL lag is zero at the final sample.
- Public application data fingerprints match.
- Auth exact parity and Storage physical parity pass through the production AWS DR reconciler in dry-run mode.
- Storage has no copy, deferred-copy, target-only, or pending-delete backlog.
- Every owned public sequence is compared with its source sequence value and both source/target table maxima.

Assess mode reports blockers but does not mutate state.

### `sync_sequences`

This is the only mutation in the preflight workflow, and it mutates **only Oregon sequence state**.

Required inputs:

- `writes_quiesced=true`
- confirmation: `ADVANCE_OREGON_SEQUENCES`

The workflow also requires:

- a quiet Virginia public-table write evidence window;
- zero WAL lag;
- exact public data parity;
- writable schema parity;
- healthy publication/subscription membership;
- exact Auth parity;
- exact Storage parity with no unresolved backlog;
- Oregon cron inactive.

For each sequence, the safe floor is the maximum of:

1. Virginia sequence `last_value`;
2. Virginia owning table maximum;
3. Oregon owning table maximum;
4. sequence floor `1`.

`is_called` is handled so the next value cannot reuse an already-present table value.

The workflow never decreases a sequence. It advances only unsafe Oregon sequences, verifies them again afterward, and leaves the inbound subscription attached.

### `final_preflight`

Read-only hard gate immediately before an explicit promotion operation.

Required inputs:

- `writes_quiesced=true`
- confirmation: `FINAL_PREFLIGHT`

It fails unless every hard blocker is clear and every Oregon sequence is already promotion-safe.

## Current expected sequence behavior

Sequence definitions are replicated only as schema, not as changing sequence state. Therefore the normal passive standby may show lower Oregon sequence values during everyday operation. That is expected.

Do not continuously mirror sequence values while Virginia is actively accepting writes. Perform the guarded sequence synchronization only after normal Virginia writes are quiesced and the database/Auth/Storage lanes are current.

## What this workflow never does

The preflight workflow does **not**:

- switch Vercel production Supabase variables;
- change the AWS runtime target;
- change EventBridge scheduler targets;
- enable any Supabase cron job;
- detach or disable the Oregon subscription;
- make Oregon the writable production primary.

## Explicit promotion workflow

The production cutover is implemented separately in `.github/workflows/oregon-dr-promotion.yml` and documented in `docs/runbooks/oregon-dr-promotion.md`.

It is manual-only and requires:

- `writes_quiesced=true`
- confirmation `PROMOTE_OREGON`

The explicit workflow repeats the critical live readiness checks, applies a real Virginia database write fence, performs the final Auth/Storage catch-up and Oregon sequence synchronization, disables the forward DR schedules, enters a fenced transition mode, detaches logical replication at an explicitly documented irreversible boundary, then switches AWS and Vercel production to Oregon.

After promotion, Virginia remains write-fenced, the forward Virginia -> Oregon schedules remain disabled, and the Auth session policy remains `reauthentication_required`.

Do not dispatch the explicit promotion workflow for a readiness test. Use `assess` or `final_preflight` here instead.
