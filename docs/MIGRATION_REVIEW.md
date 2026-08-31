# Supabase Migration Baseline

TheOutHaven now maintains a two-migration production baseline followed by normal forward migrations in `supabase/migrations/`:

1. `*_virginia_schema_baseline.sql` recreates the application schema and permanent Virginia post-cutover database changes.
2. `*_virginia_access_realtime_parity.sql` restores production ACLs and Realtime publication membership in a separate transaction so managed Supabase rebuilds stay within the Postgres lock budget.
3. `*_ensure_aws_scheduler_wrappers.sql` is the first post-baseline compatibility migration. It idempotently ensures the three public AWS scheduler wrapper functions exist in both Virginia production and the frozen Oregon rollback project, without creating `pg_cron` jobs.

Historical migration files from the pre-baseline era are retained under:

`supabase/migrations_archive/pre_virginia_baseline/`

They are audit/reference material only and must not be moved back into `supabase/migrations/` or replayed against a live project.

## Current rules

- Create all new schema changes with the Supabase CLI so each new migration has a canonical timestamped filename.
- Keep `supabase/migrations/` limited to the two immutable baseline migrations plus migrations created after that baseline pair.
- Do not rename or edit an already-applied migration after it has reached a shared environment.
- Do not modify production schema directly in the Dashboard. Capture every production schema change in a migration.
- Before merging a migration change, verify it can rebuild an empty local Supabase database with `supabase db reset` and verify the preview branch deployment.
- Migration-history repairs are tracking-only operations. They must never be used as a substitute for applying missing schema SQL.

## Baseline cutover

The core baseline was generated from the verified frozen Oregon application schema and layered with the permanent Virginia post-cutover changes that were present in Virginia's migration ledger. One-time region/storage migration helper objects and production data are intentionally excluded.

The companion access/realtime migration preserves the production application-role privilege model and the two `supabase_realtime` publication members while creating no `pg_cron` jobs. It is intentionally separate from the core baseline because the combined migration exceeded the managed Supabase `max_locks_per_transaction` budget during a fresh preview rebuild.

For the live history cutover, the existing Virginia and Oregon migration ledgers are aligned to the two baseline versions only after schema parity is independently verified. The AWS wrapper compatibility migration remains pending at that point so the normal post-merge deployment applies it to both projects: it is a no-op-equivalent refresh in Virginia and adds the otherwise-missing rollback wrappers in Oregon. This avoids recording schema as applied where it is not actually present.

The prior filename-review checklist is obsolete because those historical files are no longer active migrations. Their original SQL remains preserved in the archive for audit and rollback analysis.
