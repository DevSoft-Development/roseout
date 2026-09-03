# Oregon production DR certification — 2026-09-03

This one-shot certification closes the Oregon DR implementation only if the current production architecture proves the full guarded lifecycle on the post-repair state.

The certification workflow must:

1. Re-enable and prove the two normal Virginia -> Oregon AWS reconciliation schedules only after passive standby health passes.
2. Pass the full Oregon promotion preflight, including writable schema, public data, Auth, Storage, logical replication, cron, and project-health gates.
3. Perform the guarded Virginia -> Oregon production promotion using the existing explicit promotion workflow.
4. Pass user-facing production smoke checks while Oregon is authoritative.
5. Perform the guarded Oregon -> Virginia prepare/failback sequence using the existing explicit failback workflow.
6. Pass user-facing production smoke checks after Virginia is authoritative again.
7. Re-establish normal Virginia -> Oregon reconciliation.
8. Pass the promotion preflight again in the restored steady state.
9. Prove the final AWS state is Virginia primary, all 65 base schedules enabled, both forward DR schedules enabled, one active forward logical-replication slot, all 462 Oregon relations ready, Oregon pg_cron inactive, and Auth/Storage parity healthy.
10. Store a secret-free certification evidence artifact with guarded workflow run IDs, measured promotion/failback workflow durations, and final logical replication lag bytes.

Any failed gate stops the certification. The orchestrator does not invent an ad-hoc rollback path; the existing guarded promotion/failback workflows remain authoritative.
