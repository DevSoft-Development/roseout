# Search Ranking Rollout Runbook

## Scope

This runbook covers Phase 4D.8 through Phase 4D.12 for the hybrid ranking rollout.

## Safety rules

- Automatic promotion remains disabled.
- Only one rollout run may be active.
- Every stage change requires a reason and audit record.
- Critical alerts block promotion.
- Emergency disable remains available throughout rollout.
- Never skip stages.

## Stage order

1. `admin_shadow`
2. `admin_5`
3. `admin_25`
4. `internal_5`
5. `public_1`
6. `public_5`
7. `public_25`
8. `public_50`
9. `full`

## Phase 4D.8 — Approval integrity

1. Start a rollout run for `admin_shadow`.
2. Confirm the baseline snapshot was recorded.
3. Confirm review thresholds and latency thresholds.
4. Record a dedicated approval only after readiness passes.
5. Revoke approval immediately if a critical issue is discovered.

## Phase 4D.9 — Admin shadow

1. Activate `admin_shadow` through the atomic stage RPC.
2. Collect at least 25 shadow searches.
3. Manually review at least 10 experiments.
4. Require zero unsafe reviews.
5. Require a worse rate of 20% or less.
6. Require P95 latency of 2500 ms or less.
7. Resolve or acknowledge all critical alerts.
8. Record superadmin approval for `admin_5`.

## Phase 4D.10 — Admin canary

1. Activate `admin_5`.
2. Observe for the configured stage duration.
3. Confirm stable assignment and healthy guardrails.
4. Promote to `admin_25` only after manual approval.
5. Roll back immediately if automatic guardrails fire.

## Phase 4D.11 — Internal and public rollout

For each stage:

1. Start or continue the active rollout run.
2. Confirm minimum sample size and observation window.
3. Confirm guardrail status is healthy.
4. Confirm no unresolved rollback or critical alert exists.
5. Record manual approval.
6. Activate exactly the next stage.
7. Verify the emergency-disable path after deployment.

## Phase 4D.12 — Final hardening

- Confirm the control fallback remains available.
- Confirm audit history shows actor, reason, stage transition, and timestamp.
- Confirm alert acknowledgement is restricted to administrators.
- Enable retention cleanup only after verifying the configured retention periods.
- Run typecheck, tests, production build, and end-to-end rollout checks.
- Complete the rollout run with a final snapshot and completion reason.

## Emergency rollback

1. Use the dashboard emergency-disable action.
2. Confirm stage is `disabled`.
3. Confirm rollout percent is `0`.
4. Confirm shadow mode and guardrails are disabled.
5. Create or verify a critical alert.
6. Mark the rollout run `rolled_back` with a reason.
7. Do not start another run until the rollback is reviewed.
