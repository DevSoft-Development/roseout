# Step 3B — Feature Aggregation Pipeline

## Goal
Transform canonical ML feedback and search events into stable, confidence-aware ranking features.

## Scope
- Aggregate CTR, save rate, reservation rate, completion rate, negative feedback rate, and trend velocity.
- Apply minimum sample sizes and Bayesian-style confidence damping.
- Generate reusable location, intent, category, and pair features.
- Record run status and production-readiness diagnostics.
- Keep feature jobs deterministic and safe to rerun.

## Dependencies
- Step 3A canonical analytics integration.
- Existing Phase 1 and Phase 2 feature tables and recalculation diagnostics.

## Validation
- Unit tests for aggregation math and confidence damping.
- Zero-row and stale-source diagnostics.
- Idempotent rerun verification.
