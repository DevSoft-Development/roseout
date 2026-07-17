# Step 3C — Admin ML Dashboard

## Goal
Provide an operator-facing ML control and observability surface in the admin dashboard.

## Planned scope
- training status and last successful training time
- active model and schema versions
- drift and anomaly indicators
- feature coverage and confidence summaries
- trending locations and categories
- ranking gains and losses
- retraining queue and failed-run visibility
- search-learning and pair-learning summaries
- audit-friendly run history and diagnostics

## Delivery requirements
- reuse existing admin authorization and layout patterns
- expose read-only diagnostics before adding mutation controls
- show empty, stale, degraded, and failed states explicitly
- avoid changing public ranking behavior in this phase
- add focused tests for data shaping and permission guards
