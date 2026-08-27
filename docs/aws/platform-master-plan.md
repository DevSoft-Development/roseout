# TheOutHaven AWS Platform Master Plan

Status: implementation roadmap

## Architecture boundary

TheOutHaven keeps the user-facing Next.js application on Vercel and core PostgreSQL/Auth/RLS/Realtime on Supabase. AWS owns infrastructure workloads: customer-site delivery, durable object storage, asynchronous workers, scheduling, scalable email delivery, observability, backups, and the existing domain gateway.

### Systems that remain in place

- Vercel: `theouthaven.com`, `www.theouthaven.com`, consumer UI, admin UI, location dashboard, synchronous web APIs.
- Supabase: PostgreSQL, Auth, RLS, Realtime, core application state.
- OpenSRS/Tucows: wholesale registrar.
- `theouthaven-domains-gateway`: AWS-hosted registrar/DNS boundary for OpenSRS.
- Resend: critical transactional mail and inbound mail during migration.
- Google: Maps, Places, Geocoding, supported Places photo delivery.
- Stripe: payments and Connect.

## Target AWS services

- S3: immutable customer-site releases, first-party/business-owned media, private artifacts, exports, backups.
- CloudFront SaaS Manager: customer-site delivery, custom domains, tenant routing, TLS, caching.
- SQS + DLQs: durable background jobs.
- Lambda: short workers.
- ECS/Fargate: heavy/long-running workers only when Lambda is not appropriate.
- EventBridge Scheduler: recurring and delayed jobs.
- SES: bulk/background outbound email.
- CloudWatch: platform logs, alarms, metrics.
- Secrets Manager/SSM: AWS-side secrets.
- ACM: CloudFront customer-domain TLS.
- Route 53: TheOutHaven-controlled DNS zones where appropriate. OpenSRS DNS remains supported for OpenSRS-managed customer domains.
- Lightsail: existing website hosting during dual-publish migration and legacy/fallback capacity until S3/CloudFront is proven.

## Customer website target

Generated customer websites are static artifacts. Dynamic reservation/group-booking behavior calls back to `www.theouthaven.com`, so the target origin does not need a per-customer application server.

```text
Business clicks Publish
        |
        v
Website artifact generation
        |
        +--> immutable S3 release
        |      websites/{websiteId}/releases/{version}/...
        |
        +--> existing Lightsail publish while migration mode = dual
        |
        v
CloudFront distribution tenant
        |
        v
customer domain
```

### Hosting modes

- `lightsail`: existing production behavior.
- `dual`: publish both Lightsail and S3/CloudFront; public traffic remains on the current path until verified.
- `cloudfront_s3`: S3/CloudFront is authoritative; Lightsail retained only for explicitly supported fallback/legacy cases.

No migration step may remove the existing Lightsail path until production verification is complete.

## Versioned releases

S3 keys use immutable releases:

```text
websites/{websiteId}/releases/{version}/index.html
websites/{websiteId}/releases/{version}/...
```

The CloudFront tenant receives a parameter identifying the active release prefix. Rollback changes the tenant parameter to the previous verified release; immutable objects are not overwritten.

## Domain architecture

`theouthaven-domains-gateway` remains the single registrar-facing boundary.

It owns:
- availability search
- wholesale quote
- registration
- renewal
- registrar status/reconciliation
- OpenSRS DNS operations

It does not own S3 uploads, CloudFront tenant creation, release switching, or website rollback.

DNS is routed by provider:

```text
OpenSRS-managed domain -> domain gateway -> OpenSRS DNS
Route 53 zone          -> AWS Route 53 API
External DNS           -> required-record instructions + verification
```

The hosting provisioner returns the CloudFront routing target/validation records; the DNS orchestration layer applies them through the appropriate adapter.

## Background jobs

All asynchronous work follows this shape:

```text
producer/EventBridge -> SQS -> Lambda or Fargate -> Supabase/third party
                         |
                         +-> DLQ after bounded retries
```

Initial queues:
- `toh-website-publish`
- `toh-domain-lifecycle`
- `toh-location-enrichment`
- `toh-menu-enrichment`
- `toh-photo-enrichment`
- `toh-search-enrichment`
- `toh-location-repair`
- `toh-marketing`
- `toh-email`
- `toh-support`
- `toh-analytics`
- `toh-media-processing`

Every externally visible or billing-sensitive job must carry an idempotency key.

## Email target

Application code talks to a TheOutHaven email abstraction rather than directly to a provider.

Initial routing:
- Resend: reservations, tickets, experience confirmations, security/account-critical mail, support, important owner communications, inbound mail.
- SES: newsletters, marketing, large owner outreach, bulk notifications, scheduled informational mail, digests.

Both providers normalize delivery events into one application event model (`sent`, `delivered`, `opened`, `clicked`, `bounced`, `complained`, `failed`). Provider failover is not enabled until cross-provider idempotency is proven.

## Media policy

S3/CloudFront stores TheOutHaven-owned or business-authorized content. Google Places content must continue to follow Google Places storage/caching/attribution terms; the platform must not indiscriminately copy third-party Places photos into permanent S3 storage.

## Observability

CloudWatch alarms should cover:
- CloudFront 4xx/5xx
- S3 errors
- SQS age/depth
- DLQ count
- Lambda errors/duration/throttles
- Fargate task failures
- domain gateway failures
- website publish failures
- TLS/domain provisioning failures
- SES bounce/complaint rate

The admin dashboard remains the operational control plane and should surface normalized health rather than requiring routine AWS Console use.

## Implementation phases

0. Cost controls, tags, IAM/OIDC audit.
1. S3 website/media foundation.
2. Versioned S3 website publisher.
3. Dual Lightsail + S3 publishing.
4. CloudFront tenant-only distribution foundation.
5. Distribution tenant provisioning and connection group routing.
6. Managed TLS/customer domain automation.
7. OpenSRS/domain-gateway DNS target integration.
8. External-domain validation path.
9. Release activation + one-click rollback.
10. Production test site, then one real custom-domain canary.
11. Gradual customer-site migration.
12. SQS/DLQ foundation.
13. Lambda worker foundation.
14. EventBridge scheduling.
15. Domain lifecycle worker migration.
16. Repair/enrichment worker migration.
17. Fargate heavy-worker foundation only where justified.
18. First-party/business-owned media S3 + CloudFront delivery.
19. Email provider abstraction.
20. SES bulk/background delivery + normalized events.
21. CloudWatch central monitoring and admin infrastructure dashboard.
22. Independent S3 backup expansion.
23. Search telemetry/search-learning workers.
24. Evaluate cache layer and Bedrock only from measured need.
25. Reduce Lightsail capacity only after CloudFront/S3 production proof.

## Rollout rules

- Default production hosting mode remains `lightsail` until explicitly changed.
- `dual` is the only allowed intermediate production mode.
- A CloudFront/S3 canary must pass content parity, HTTPS, custom domain, mobile, reservation/group booking widget, forms, analytics, cache behavior, rollback, and failure testing before `cloudfront_s3` is enabled broadly.
- Domain registration/renewal stays behind `theouthaven-domains-gateway` throughout the migration.
- Supabase database/Auth and the main Vercel app are out of scope for migration unless future measured cost/reliability data justifies revisiting them.
