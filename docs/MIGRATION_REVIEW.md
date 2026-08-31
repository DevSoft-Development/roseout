# Supabase Migration Baseline

TheOutHaven now maintains one active production schema baseline in `supabase/migrations/`.

Historical migration files from the pre-baseline era are retained under:

`supabase/migrations_archive/pre_virginia_baseline/`

They are audit/reference material only and must not be moved back into `supabase/migrations/` or replayed against a live project.

## Current rules

- Create all new schema changes with the Supabase CLI so each new migration has a canonical timestamped filename.
- Keep `supabase/migrations/` limited to the active baseline plus migrations created after that baseline.
- Do not rename or edit an already-applied migration after it has reached a shared environment.
- Do not modify production schema directly in the Dashboard. Capture every production schema change in a migration.
- Before merging a migration change, verify it can rebuild an empty local Supabase database with `supabase db reset` and verify the preview branch deployment.
- Migration-history repairs are tracking-only operations. They must never be used as a substitute for applying missing schema SQL.

## Baseline cutover

The baseline was generated from the verified frozen Oregon application schema and layered with the permanent Virginia post-cutover changes that were present in Virginia's migration ledger. One-time region/storage migration helper objects and production data are intentionally excluded.

The prior filename-review checklist is obsolete because those historical files are no longer active migrations. Their original SQL remains preserved in the archive for audit and rollback analysis.
