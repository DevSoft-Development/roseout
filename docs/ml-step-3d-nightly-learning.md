# Step 3D — Automated Nightly Learning Jobs

## Goal
Automate safe, observable ML aggregation and learning workflows on a nightly schedule.

## Planned scope
- aggregate analytics and search feedback
- aggregate reservation and outing-completion signals
- refresh feature tables
- retrain ranking, pairing, and category models
- run drift and anomaly detection
- record model and schema versions
- prevent promotion when quality gates fail
- preserve the last known-good model for rollback
- send an admin digest with run outcomes and recommended actions

## Delivery requirements
- idempotent and retry-safe jobs
- explicit job locking and overlap protection
- bounded batch sizes and execution time
- structured run diagnostics and failure reasons
- safe dry-run/manual execution path
- no automatic production promotion without passing validation gates
