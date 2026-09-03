# DR replication column parity repair

On 2026-09-02 the Virginia -> Oregon logical replication subscription `theouthaven_va_to_or_dr` was automatically disabled because `disable_on_error=true` and Oregon's `public.payment_logs` table did not contain columns already published by Virginia.

The same pre-existing schema drift affected the Stamps postage columns on `public.mailing_batch_items`.

`20260903024500_restore_dr_replicated_column_parity.sql` restores those target column definitions idempotently. It is safe to apply to both regions: Virginia already has the columns, while Oregon receives the missing definitions.

After applying the migration to both regions, the recovery sequence is:

1. Confirm Virginia `pg_cron=0`, publication and slot exist.
2. Confirm Oregon active `pg_cron=0` and all 462 subscription tables remain ready.
3. Re-enable `theouthaven_va_to_or_dr` without changing its slot or connection definition.
4. Require an Oregon replication worker and an active Virginia slot.
5. Allow WAL lag to drain; do not bypass the passive-standby guard.
6. Re-run the fail-closed DR scheduler activation only after passive standby health is green.

Do not manually enable the two forward DR EventBridge schedules before the DR scheduler activation gate passes.
