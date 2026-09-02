# Scheduler invoker ownership boundary

The `theouthaven-edge-runtime-production` CloudFormation stack owns the central EventBridge scheduler invoker Lambda resource, but the canonical production invoker code is `infra/aws/lambda/edge_scheduler_invoker.py` because it routes three workload types:

- Edge-native functions to the AWS Edge Runtime
- `node:` targets to the private AWS Background Runtime
- explicit `sqs:` targets to durable queue workers

An Edge Runtime stack deployment can replace the Lambda code with the stack's inline bootstrap. Therefore the guarded scheduler activation workflow must restore and smoke-test the canonical multi-runtime invoker **after** a successful Edge Runtime deployment and **before** applying an activation allowlist.

If the restore or Node-routing smoke test fails, activation must fail closed and restore the previous scheduler allowlist. Vercel ownership must not be removed until the replacement AWS probe is green.

For Batch 10, the current-main retry is intentionally triggered only after the private AWS Background Runtime has passed both its direct health check and the non-mutating scheduler-to-Node routing canary. The subsequent Edge Runtime workflow-run activation remains responsible for the functional `crm-sequence-runner` and `search-hf-photo-intelligence` probes and automatic rollback.

The Batch 10 post-recovery activation retry is additionally gated on a Virginia service-role credential resolved from the Supabase Management API, validated directly against the Virginia REST API, synchronized into protected Vercel/AWS server storage, and proven by successful direct private CRM and HF probes.

This boundary does not own or modify the isolated DR reconciliation schedules, Virginia `pg_cron`, or database promotion state.
