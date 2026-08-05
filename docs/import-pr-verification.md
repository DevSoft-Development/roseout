# Existing import upgrade verification

This branch upgrades the current TheOutHaven import system. It does not introduce a replacement importer.

## Required checks before merge

- Run the versioned Supabase migration in a staging project.
- Confirm the nightly GET route resumes with the existing cursor and stays inside the Vercel runtime budget.
- Confirm manual POST imports retain quality presets and continuation behavior.
- Verify `requireHours=true` rejects records without usable Google hours and imported rows persist normalized hour metadata.
- Verify restaurant imports retain reservation URLs and populate provider, status, source, and verification metadata where supported.
- Verify Google photos are cached through the existing `location-images` helper and the resulting Supabase URL/path are saved.
- Verify restaurant/activity canonical synchronization succeeds and canonical profile refreshes are queued.
- Verify Bronx addresses do not resolve to Westchester and market corrections are logged.
- Verify exact duplicates update or skip safely and probable duplicates remain reviewable.
- Verify claim-code creation no longer fails because of the missing `claim_code` column.
- Verify partial runs return `partially_successful`, include a continuation cursor, and do not report complete success.
- Verify the import operations page keeps Google, NYC, OSM, dry run, presets, continuation, successful locations, duplicates, and logs.
- Run build, lint, typecheck, tests, and responsive browser verification.

## Deployment note

The migration must be applied before relying on the new enrichment and import-log columns. Do not mark the PR ready until CI and staging validation pass.
