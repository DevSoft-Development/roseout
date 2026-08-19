# Production Supabase Storage backups

TheOutHaven keeps an independent copy of Supabase Storage objects in the AWS S3 bucket configured by the repository variable `AWS_BACKUP_BUCKET`.

## Schedule

`.github/workflows/production-storage-backup.yml` runs every day at 08:45 UTC and can also be started manually with `workflow_dispatch` after it is merged to `main`.

The database backup runs separately at 08:15 UTC.

## Source

The workflow uses Supabase's S3-compatible Storage endpoint:

- Project ref: `hnhbzynoyrhjndefbwkh`
- Region: `us-west-2`
- Endpoint: `https://hnhbzynoyrhjndefbwkh.storage.supabase.co/storage/v1/s3`

The generated Supabase S3 credentials are server-side credentials and bypass Storage RLS. They must only be stored as GitHub Actions secrets:

- `SUPABASE_STORAGE_ACCESS_KEY_ID`
- `SUPABASE_STORAGE_SECRET_ACCESS_KEY`

Never commit those values.

## Destination layout

Objects are copied without propagating source deletions:

```text
s3://<AWS_BACKUP_BUCKET>/storage/objects/<supabase-bucket>/<object-path>
```

A timestamped manifest is written for every successful run:

```text
s3://<AWS_BACKUP_BUCKET>/storage/manifests/YYYY/MM/DD/<timestamp>/<bucket>.json
s3://<AWS_BACKUP_BUCKET>/storage/manifests/YYYY/MM/DD/<timestamp>/summary.json
```

The destination bucket already has S3 versioning enabled. Replacing an object therefore creates a new S3 object version. Source deletions are intentionally not propagated, so an accidental deletion in Supabase does not remove the independent backup copy.

## Verification

For every source bucket, the workflow:

1. copies objects with `rclone copy`;
2. runs a one-way size comparison against the AWS copy;
3. writes a source inventory manifest with paths, sizes, and timestamps;
4. uploads the manifest with SSE-S3 encryption; and
5. verifies the run-level summary manifest exists in AWS S3.

The workflow fails if configuration is missing, no source buckets are returned, a copy/check fails, a manifest cannot be written, AWS OIDC cannot assume the backup role, or the final manifest cannot be verified.

## Restore principle

For a storage restore, use the dated manifest to determine the intended source state, then copy the required objects from `storage/objects/<bucket>/` back through the Supabase S3 protocol. If a current AWS object was overwritten, use S3 object version history to recover the required older version first.

Do not restore Storage by writing directly into Supabase's internal backing files. Supabase requires storage objects to be written through its Storage/S3 API so metadata remains consistent.

## Security

- AWS access uses GitHub OIDC temporary credentials; no long-lived AWS access key is stored in GitHub.
- The Supabase S3 access key is scoped only by Supabase and has full Storage access, so treat it as a production secret.
- Destination objects are written with SSE-S3 (`AES256`).
- The backup workflow does not issue delete operations against either Supabase Storage or the AWS backup bucket.
