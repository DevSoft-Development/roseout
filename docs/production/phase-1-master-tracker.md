# Phase 1 Master Production Tracker

Branch: `agent/master-production-stabilization-phase-1`
Status: active

This branch is the authoritative implementation branch for all remaining Phase 1 production stabilization work before soft launch.

## Rules

- All Phase 1 fixes should target this branch unless isolation is required for safety.
- Relevant existing PRs should be merged, cherry-picked, superseded, or closed in a controlled order.
- This branch must remain open until implementation and validation are complete.
- Documentation-only commits do not count as completed fixes.
- No competing CRM, search, menu, reservation, claims, or production-readiness systems should be introduced.

## Required completion evidence

- Typecheck passes.
- Production build passes.
- No new lint errors.
- Enterprise search regression tests pass.
- Confirmed search failures are fixed.
- CRM publishability and photo status are consistent.
- Hidden-location single and bulk repair actions work.
- Duplicate review does not silently change the primary location domain.
- Focused E2E tests cover repaired workflows.
- Final PR body includes exact commands and results.
