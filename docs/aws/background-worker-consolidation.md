# TheOutHaven background worker consolidation

## Target operating model

- Vercel serves the public/admin/location web application only.
- AWS EventBridge Scheduler is the only recurring scheduler.
- The self-hosted Supabase Edge Runtime on AWS Lambda is the default background runtime.
- A private Node.js Lambda compatibility runtime executes jobs that still depend on Next.js/server-only modules.
- Dedicated SQS/Lambda workers own infrastructure workloads such as registrar lifecycle.
- ECS/Fargate remains web disaster-recovery capacity and is not a routine cron executor.
- Virginia Supabase keeps zero `pg_cron` jobs.
- Oregon DR does not run an independent business scheduler.

## Ownership rules

Every recurring business operation must have exactly one canonical scheduling owner. Queue dispatchers and retry workers may share a capability with a scheduled producer, but two independent recurring schedulers must not execute the same operation.

### Confirmed duplicate recurring ownership

| Capability | Current paths | Canonical owner after consolidation |
| --- | --- | --- |
| Domain lifecycle | Vercel `domain-lifecycle` every 5 minutes **and** AWS EventBridge -> domain lifecycle SQS -> Lambda every 5 minutes | AWS EventBridge -> domain lifecycle SQS -> Lambda only |

The Vercel domain-lifecycle schedule must be removed only after the AWS worker target is verified against the Virginia production Supabase project.

### Compatibility routes that should not remain scheduling owners

| Capability | Current compatibility path | Canonical execution path |
| --- | --- | --- |
| Search anchor reconciliation | `/api/cron/search-anchor-reconciliation` enqueues `search.anchor.reconcile` | AWS worker dispatcher -> `search-anchor-reconciliation` Edge function |
| Nightly search profile queue | `/api/cron/nightly-search-profile-queue` proxies the Edge function | EventBridge -> `nightly-search-profile-queue` Edge function |

These routes can remain temporarily for manual/backward compatibility, but recurring execution should bypass Vercel.

### Shared capabilities that are not automatically duplicates

`worker-dispatcher-unified` is a queue dispatcher. Its presence does not by itself mean the corresponding direct Edge function is duplicated. A scheduled producer plus a queued retry/worker consumer is valid when they have distinct responsibilities and idempotency boundaries.

Current dispatcher job types include photo backfill, Google photo/metadata enrichment, search anchor reconciliation, search QA, reservation cleanup, search document/embedding work, analytics aggregation, AI enrichment, duplicate detection, review moderation, and publishability repair.

### Overlap requiring consolidation review

The following areas have multiple enrichment/maintenance components and must be consolidated by responsibility rather than name alone:

- `catalog-enrichment-runner` versus `google-location-enrichment`, `unified-location-gap-repair`, and queued Google enrichment jobs.
- photo backfill direct scheduling versus queued photo/enrichment work.
- reservation cleanup direct Edge maintenance versus queued `reservation.cleanup` work.
- search maintenance routes versus queued search document/embedding/reconciliation workers.

For each area, preserve a single producer/scheduler and keep queue consumers only where they provide bounded execution, retries, or fan-out.

## Migration phases

1. Deploy and smoke-test the private AWS Node background runtime. It has no public endpoint and reads the existing production platform-DR app environment secret.
2. Extend the existing EventBridge scheduler invoker to target Edge, private Node Lambda, or the existing infrastructure queue workers. Do not create a second scheduler fleet.
3. Add the former Vercel jobs to the AWS schedule manifest in a disabled state and probe each canonical target.
4. Remove duplicate scheduling paths, beginning with domain lifecycle and compatibility proxy schedules.
5. Activate the AWS schedules through the existing guarded activation/rollback workflow.
6. Remove all `crons` from `vercel.json` only after the AWS inventory is verified green.
7. Move the website-hosting heartbeat receiver to AWS and repoint the hosting nodes.
8. Update the admin cron control plane and manual Run Now action so work executes in AWS rather than inside Vercel.
9. Verify Vercel recurring `/api/cron/*`, `/api/cron/managed`, and hosting heartbeat traffic falls to zero.

## Safety invariants

- Never enable AWS and Vercel recurring ownership for the same operation during cutover.
- New AWS schedules are deployed disabled until their target is successfully probed.
- A failed activation probe rolls back the managed AWS schedule batch.
- Virginia remains the normal writable production database and keeps zero `pg_cron` jobs.
- Domain lifecycle must not be re-enabled against the Oregon DR project.
