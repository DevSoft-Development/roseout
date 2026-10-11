# Supabase Preview migration-history reconciliation (non-destructive)

Observed on October 11, 2026:
- Supabase Preview project `hnhbzynoyrhjndefbwkh` reports `Remote migration versions not found in local migrations directory`.
- A read-only comparison of `list_migrations` against `supabase/migrations` on `main` found **101** remote versions, **111** repository SQL files, and **101** remote versions without a corresponding version-named local file. This is a material history divergence, not a missing-schema proof.
- The primary operational project `ftdsltatyqhtllyyefzp` also uses migration history with remote-specific version identifiers, so bulk repair against production is NOT authorized.

## Safe repair plan
1. Retrieve SQL for each remote-only version from its original deployment branch, backup, change log, or Supabase migrations history; hash and verify it against the deployed schema.
2. Determine which history ledger is canonical for each project. A matching title is not sufficient to declare migrations equivalent.
3. In an isolated disposable preview branch/project only, reconstruct the missing versioned migration files **with their actual SQL**, or establish an audited baseline with schema diff and restore proof.
4. Compare `supabase db diff` and drift checks. Require zero unexpected object changes and valid extension/role/function parity.
5. Only then consider `supabase migration repair` for individually verified version records, with rollback evidence. NEVER bulk-revert all remote entries or replay migration SQL against production.
6. Re-run Supabase Preview integration and capture passing check evidence before closing cleanup.

## Example remote-only versions (not exhaustive)
`20260902113008`, `20260902113015`, `20260902181303`, `20260903001759`, `20260905175751`, `20260916003144`, `20261004170517`.

**Status:** root cause identified; remediation blocked on locating the authentic migration SQL / adopting a verified baseline. No production migration history or schema has been mutated.
