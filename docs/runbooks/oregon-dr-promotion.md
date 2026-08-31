# Oregon DR explicit production promotion

This runbook covers the manual Virginia -> Oregon disaster-recovery promotion implemented by `.github/workflows/oregon-dr-promotion.yml`.

The workflow is intentionally **manual only**. Pull requests and pushes run static validation; they never promote Oregon.

## Normal state

Before promotion:

- Virginia (`ftdsltatyqhtllyyefzp`) is the writable production primary.
- Virginia `pg_cron` has 0 jobs.
- Oregon (`hnhbzynoyrhjndefbwkh`) is passive.
- Oregon has 25 preserved legacy cron jobs and 0 active jobs.
- `public` replicates Virginia -> Oregon through:
  - publication `theouthaven_dr_publication`
  - slot `theouthaven_va_to_or_dr_slot`
  - subscription `theouthaven_va_to_or_dr`
- Auth and Storage are reconciled by the two isolated AWS DR schedules.
- The 24 business schedules and 2 forward DR schedules are enabled.
- `/theouthaven/production/dr-reconciler/env` has `DR_MODE=virginia_primary`.

## Invocation

Dispatch **Oregon DR explicit promotion** only for an intentional production failover.

Required inputs:

- `writes_quiesced=true`
- confirmation: `PROMOTE_OREGON`

Do not use this workflow as a test or routine maintenance operation. Use the promotion preflight workflow for read-only readiness testing.

## Promotion safety model

The workflow uses two fences.

### Scheduler fence

All 24 business EventBridge schedules are disabled before the final catch-up window. The 2 forward DR schedules remain available just long enough to finish Auth and Storage convergence, and are then disabled before logical replication is detached.

### Virginia database write fence

Before the final catch-up, the workflow sets `default_transaction_read_only=on` for:

- `authenticator`
- `supabase_auth_admin`
- `supabase_storage_admin`

It terminates existing sessions for those roles so new REST/Auth/Storage transactions inherit the fence immediately.

This makes Virginia a read-only source during the final replication, Auth, Storage, and sequence checks. The fence remains in place after successful Oregon promotion and must not be removed manually.

## Final catch-up before detach

With Virginia fenced, the workflow requires:

1. a 5-second quiet public-write evidence window;
2. final forward Auth reconciliation Virginia -> Oregon;
3. final physical Storage reconciliation Virginia -> Oregon;
4. exact Auth parity;
5. exact Storage parity;
6. zero Storage copy/deferred/target-only/pending-delete backlog;
7. zero logical WAL lag;
8. exact public-data fingerprint parity;
9. exact writable-schema parity;
10. Oregon sequence advancement to safe floors, never decreasing any sequence;
11. Oregon email/password Auth enabled;
12. Oregon Microsoft OAuth start redirect healthy.

The Auth session policy remains `reauthentication_required`. The workflow does not copy or rotate signing keys.

## AWS transition fence

The AWS Edge Runtime reads the authoritative `DR_MODE` from the isolated DR secret.

Supported control modes are:

- `virginia_primary`
- `promotion_in_progress`
- `oregon_primary`
- `failback_in_progress`

During `promotion_in_progress` or `failback_in_progress`, normal AWS Supabase proxy traffic and non-DR function execution return HTTP 503. The DR workers remain callable so recovery diagnostics can still run.

The promotion workflow forces a Lambda configuration refresh whenever it changes primary mode. This is required because the Edge Runtime caches Secrets Manager values inside warm Lambda environments.

## Irreversible boundary

Immediately before Oregon can accept production writes, the workflow performs:

1. `ALTER SUBSCRIPTION theouthaven_va_to_or_dr DISABLE`
2. `ALTER SUBSCRIPTION theouthaven_va_to_or_dr SET (slot_name = NONE)`
3. `DROP SUBSCRIPTION theouthaven_va_to_or_dr`
4. waits for the Virginia forward slot to be inactive
5. drops `theouthaven_va_to_or_dr_slot`

The Virginia publication is retained so the normal Virginia -> Oregon standby lane can be rebuilt after a future failback.

Once the subscription is dropped, the workflow considers the operation to have crossed the irreversible boundary. It will **not** automatically recreate replication or reopen Virginia writes.

## Oregon target switch

After detach, the workflow:

1. updates the AWS normal runtime secret to Oregon;
2. changes the DR control secret to `DR_MODE=oregon_primary`;
3. forces a fresh Edge Runtime Lambda configuration generation so warm Virginia-targeted containers are evicted;
4. updates production-only Vercel Supabase variables to Oregon;
5. creates a fresh production redeployment from the current production deployment;
6. waits until the new deployment is `READY`;
7. re-enables all 24 business EventBridge schedules;
8. keeps both forward Virginia -> Oregon DR schedules disabled.

The Edge Runtime router is primary-aware. Therefore a later ordinary AWS runtime deployment cannot silently return business workers to Virginia merely because the normal deployment workflow still materializes the Virginia base secret: `DR_MODE=oregon_primary` overrides those normal Supabase values with Oregon values from the isolated DR secret.

The DR scheduler activation workflow is also primary-aware and refuses to re-enable the 2 forward reconciliation schedules while Oregon is primary or while a DR transition is in progress.

## Successful post-promotion state

A successful promotion requires all of the following:

- `DR_MODE=oregon_primary`
- AWS normal runtime secret points to Oregon
- Vercel production Supabase URL points to Oregon
- fresh Vercel production deployment is `READY`
- `https://theouthaven.com` returns healthy HTTP
- Oregon Data API responds successfully
- Virginia forward replication slot is absent
- Oregon forward subscription is absent
- Virginia `pg_cron=0`
- Oregon active `pg_cron=0`
- 24 base EventBridge schedules enabled
- 2 forward DR schedules disabled
- Virginia application/Auth/Storage database roles remain read-only fenced
- session strategy remains `reauthentication_required`

At that point Oregon is the sole production primary.

## Failure behavior

### Failure before logical replication detach

The workflow can safely restore the old control plane. It will:

- remove the Virginia role-level write fence;
- restore the prior DR secret / `virginia_primary` mode;
- force the Edge Runtime to reload control state;
- re-enable the 24 business schedules;
- re-enable the 2 forward DR reconciliation schedules.

Oregon sequence advancement is intentionally not rolled back because sequence values are never decreased and the forward subscription remains intact.

### Failure after logical replication detach

There is no automatic rollback.

The workflow will:

- keep Virginia write-fenced;
- disable all 24 business schedules;
- keep the 2 forward DR schedules disabled;
- preserve the current transition/Oregon control state;
- refuse to recreate subscriptions or switch traffic back automatically.

Recovery must continue from the recorded state. Do not manually make both projects writable.

## After Oregon promotion

Do not reactivate either project's Supabase cron.

Do not manually re-enable the forward DR schedules.

Do not remove the Virginia database fence.

The next recovery operation is the guarded Oregon -> Virginia failback sequence:

1. establish a temporary Oregon -> Virginia logical replication lane;
2. run reverse Auth and Storage reconciliation;
3. synchronize Virginia sequences;
4. pass the failback hard gate;
5. switch control back to Virginia;
6. rebuild normal Virginia -> Oregon standby replication;
7. only then re-enable the two normal forward DR schedules.
