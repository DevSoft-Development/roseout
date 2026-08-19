# Production S3 database backups

TheOutHaven keeps an independent logical copy of the production Supabase database in a private Amazon S3 bucket.

## AWS authentication

The GitHub Actions workflow uses GitHub OIDC and assumes this AWS IAM role:

`arn:aws:iam::742020474738:role/TheOutHavenGitHubBackupRole`

No long-lived AWS access key or AWS secret key is required in GitHub.

The IAM trust policy should restrict the OIDC subject to the production repository and branch:

`repo:DevSoft-Development/roseout:ref:refs/heads/main`

The role's S3 permissions should be limited to the production backup bucket and should not include `s3:DeleteObject`.

## GitHub configuration

Repository Actions configuration requires:

- Repository variable `AWS_BACKUP_BUCKET`: exact name of the private S3 backup bucket.
- Repository secret `SUPABASE_DB_URL`: percent-encoded production Supabase Postgres connection string suitable for `supabase db dump`.

Do not store the database URL in repository variables, workflow YAML, source files, issues, or pull requests.

## Schedule

`.github/workflows/production-s3-backup.yml` runs daily at 08:15 UTC and can also be run manually from GitHub Actions. The job is restricted to the `main` branch so it matches the AWS OIDC trust boundary.

## Backup contents

Each run uses the Supabase CLI to create:

- `roles.sql` for database roles
- `schema.sql` for the logical schema
- `data.sql` for logical data using COPY statements

The three files are packed into one gzip archive. A SHA-256 checksum file and JSON manifest are uploaded beside the archive.

The backup follows Supabase's documented logical backup pattern. Supabase database backups do not contain Storage object bytes, so Supabase Storage object replication is a separate DR task and is not claimed as covered by this workflow.

## S3 object layout

Objects are written under a timestamped prefix:

`database/YYYY/MM/DD/YYYYMMDDTHHMMSSZ/`

The workflow uploads the archive with SSE-S3 encryption requested explicitly and stores the local SHA-256 digest as object metadata. It then calls `HeadObject` and verifies that the checksum metadata returned by S3 matches the expected digest before declaring the run successful.

## First-run verification

After merging and configuring the variable and secret:

1. Run **Production S3 database backup** manually from the Actions page on `main`.
2. Confirm the workflow reaches **Verify uploaded backup** successfully.
3. Open the S3 bucket and confirm the timestamped prefix contains the `.tar.gz`, `.sha256`, and `.manifest.json` files.
4. Confirm the object's server-side encryption is AES256/SSE-S3 or the bucket's stronger configured default.
5. Record the first successful run before treating off-site database backup coverage as live.

## Restore readiness

A successful upload is only the first half of disaster recovery. A later DR phase must download an archive into an isolated recovery environment, verify its SHA-256 digest, restore roles/schema/data in the documented order, and run application-level validation before the backup system can be considered restore-tested.
