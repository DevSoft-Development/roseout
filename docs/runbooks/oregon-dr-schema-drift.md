# Oregon DR schema-drift protection

Virginia (`ftdsltatyqhtllyyefzp`) is the writable production primary. Oregon (`hnhbzynoyrhjndefbwkh`) is the passive cross-region DR target.

PostgreSQL logical replication moves row changes, but it does not keep DDL or sequence state synchronized. A production schema change is therefore incomplete until Oregon has the compatible writable schema and the logical publication/subscription still covers the complete replicated table set.

## Automated gate

Workflow: `.github/workflows/oregon-dr-schema-drift.yml`

The gate runs:

- manually with `assess` or `enforce` mode;
- on pull requests that change Supabase migration/DR-schema files;
- after matching changes land on `main`.

It is event-driven only. Do not add a GitHub cron, Supabase cron, second AWS scheduler group, or second Lambda fleet for schema drift.

The writable catalog contract is defined in `scripts/dr/writable-catalog.sql` and compares Virginia with Oregon by object identity plus definition hash for:

- public tables, including RLS enabled/forced state and replica identity;
- live columns, ignoring historical dropped-column attribute-number gaps;
- constraints;
- indexes;
- non-internal triggers, including enabled state;
- RLS policies;
- application functions/procedures in `public`, `private`, and `fraud_internal`;
- views and materialized views in those application schemas;
- enum/domain types;
- sequence definitions, excluding mutable current values.

The one-time region/storage migration helper tables and Virginia-only cutover helper functions remain outside the reusable DR schema contract.

The same gate also requires:

- Virginia `pg_cron` contains 0 jobs;
- the Virginia DR logical slot is active;
- the Virginia publication exactly covers every eligible public application table;
- Oregon legacy `pg_cron` has 0 active jobs;
- the Oregon subscription is enabled with one connected worker;
- the Oregon subscription exactly covers every eligible public application table;
- every subscribed relation is in replication state `r`.

`enforce` fails on any drift or replication-membership gap. `assess` reports the same findings without intentionally failing the workflow.

## Schema-change order

For any schema change affecting replicated application objects:

1. Confirm the schema-drift gate is green before the change.
2. Apply compatible DDL to Oregon first while Oregon remains passive.
3. Apply the production schema change to Virginia.
4. If a new eligible public table was introduced, add it to `theouthaven_dr_publication` on Virginia.
5. Refresh `theouthaven_va_to_or_dr` on Oregon.
6. Wait until every subscription relation reports `srsubstate = 'r'` and the worker is connected.
7. Re-run the schema-drift gate in `enforce` mode.
8. Only then consider the production schema change DR-complete.

Do not blindly replay historical Supabase migrations to force migration-ledger equality. The known historical migration-ledger mismatch is separate from the live writable-schema contract.

## New-table example

A new replicated table must exist compatibly in Oregon before Virginia starts publishing row changes for it. Once both schemas contain the table, update the publication and refresh the Oregon subscription. The schema-drift gate intentionally fails if the table exists in the eligible table set but is missing from either publication/subscription membership.

## Promotion rule

A Virginia-to-Oregon promotion must not proceed while this gate reports schema drift, publication/subscription membership mismatch, disconnected replication, a pending relation state, or a cron safety violation.

Sequence **definitions** are checked here. Sequence **current values** are data-plane state and must be synchronized during the controlled promotion sequence after Virginia writes are quiesced and before Oregon accepts writes.

## Split-brain and safety rules

- Virginia remains writable primary until an explicit promotion.
- Oregon must stay passive while the normal Virginia-to-Oregon subscription is attached.
- Never enable Supabase cron in either region as part of DR.
- Never include `auth` or `storage` in the public logical publication.
- Never use Supavisor for logical replication.
- Never make Oregon writable before detaching its inbound Virginia subscription.
