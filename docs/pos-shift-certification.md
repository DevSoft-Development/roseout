# ThePOSHaven shift certification

Run `node scripts/pos-shift-certification.mjs` from the repository root.

The GitHub Actions workflow `ThePOSHaven Shift Certification` runs on POS-impacting pull requests, pushes to main, and manual dispatch. Recurring scheduling must be provisioned through AWS rather than GitHub Actions cron. It runs a deterministic 18-scenario shift simulation plus existing POS payments, manager-control, Signature+, and operational-shard contract regressions.

**Scope:** simulation-only. The JSON evidence artifact contains scenario pass/fail results and drawer reconciliation. A green job does **not** mean Stripe payments, live Supabase RPCs, kitchen printer hardware, or production DR failover have been exercised. This workflow has read-only repository access, no production secrets, no network-backed payment execution, and no live database writes.

## Financial acceptance

The simulation starts with $200 in cash, records $45 in cash sales and a $10 cash refund, then asserts an expected and counted close of $235 with zero variance. Split tender, duplicate attempt, refund replay, PIN restrictions, kitchen/receipt state, inventory decrement, and offline recovery are checked.

## Remaining certification tiers

1. **Isolated integration**: Provision a dedicated non-production shard database and a test location, then execute the real API and SQL RPCs with seeded fixtures. Use Stripe **test mode** under a dedicated test Connect account; assert webhook completion, retry identity, refunds, drawer/report reconciliation, and source/replica parity. A failed setup must fail closed rather than silently falling back to simulation.
2. **Hardware acceptance**: On a physical POS test device, certify KDS printer, cash drawer, card terminal, failed printer recovery, and offline sync with no real customer data.
3. **Production non-mutating verification**: Verify deployed Git revision, shard schema, health and replication state. Do not create transactions or invoke payment/refund APIs against production.

Do not use this simulation workflow as the sole gate for restaurant onboarding or card-payment readiness.
