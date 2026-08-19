# Production DR restore validation

TheOutHaven validates that its independent AWS S3 backups can actually be used for recovery instead of treating successful uploads as sufficient proof.

## Workflow

`.github/workflows/production-dr-restore-validation.yml` is manual-only during the first validation phase. It runs only from `main` and requires the operator to type exactly:

`RESTORE-VALIDATION`

The workflow uses the existing GitHub OIDC AWS role and the repository variable `AWS_BACKUP_BUCKET` to read the independent backup set.

## Required recovery target

Create a dedicated, non-production Supabase project for restore testing and store its Session Pooler connection string as the repository secret:

`RECOVERY_DB_URL`

Never set `RECOVERY_DB_URL` to the production project. The workflow also rejects any recovery URL containing the production project ref `hnhbzynoyrhjndefbwkh`.

Do not reuse the production database password for the recovery project.

## Database validation

The workflow:

1. finds the newest database `.manifest.json` under `database/` in S3;
2. downloads the manifest, archive, and `.sha256` sidecar;
3. verifies the archive SHA-256 against both the manifest and sidecar;
4. extracts `roles.sql`, `schema.sql`, and `data.sql`;
5. uses the official PostgreSQL 17 Docker client to restore into the isolated recovery project with `ON_ERROR_STOP=1`, one transaction, and triggers disabled during data loading through `session_replication_role = replica`;
6. verifies public tables, `auth.users`, `storage.buckets`, and `storage.objects`; and
7. records elapsed restore time as an initial RTO measurement.

The restore order follows Supabase's documented CLI restore sequence: roles, schema, then data.

## Storage validation

This first restore-validation stage verifies the newest Storage backup summary and every per-bucket manifest in that run. It records source bucket count, object count, and bytes, and fails if the per-bucket manifest set is incomplete.

It intentionally does not write Storage object bytes back into Supabase yet. Restoring Storage objects is a separate stage because those bytes must be written through the Supabase Storage/S3 interface rather than directly into internal backing storage.

## Safety properties

- Production project ref is explicitly blocked as a recovery destination.
- Workflow is manual-only until the first restore is proven.
- AWS access is read-only for this workflow and uses temporary GitHub OIDC credentials.
- The workflow does not delete or modify objects in the production backup bucket.
- The workflow does not change production DNS or application routing.
- The recovery project must be disposable and isolated from production traffic.

## First run

1. Create a dedicated recovery Supabase project.
2. Enable any non-default database extensions used by production before restoring.
3. Add `RECOVERY_DB_URL` to GitHub Actions repository secrets.
4. Open **Actions → Production DR restore validation**.
5. Choose `main` and enter `RESTORE-VALIDATION`.
6. Run the workflow.
7. Record the database and Storage RPO values and the restore elapsed-time/RTO value from the job summary.

Do not consider disaster recovery restore-tested until the database restore is green and the later Storage object-restore stage is also proven.
