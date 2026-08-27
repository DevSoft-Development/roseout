# AWS worker, SES, and registrar lifecycle rollout

This rollout is intentionally staged. Merging the code does not move production work to AWS.

## Safe defaults

The application defaults remain:

- `EMAIL_DELIVERY_MODE=resend`
- `DOMAIN_REGISTRAR_LIFECYCLE_MODE=vercel`
- AWS domain lifecycle schedule disabled

The existing Vercel domain lifecycle cron continues running every five minutes. When registrar lifecycle ownership moves to AWS, the same Vercel cron remains active for customer website DNS/HTTPS health and Lightsail recovery.

## Required GitHub environment configuration

Variables:

- `AWS_PLATFORM_DEPLOY_ROLE_ARN`
- `AWS_WORKER_SUPABASE_URL`
- optional `AWS_DOMAIN_GATEWAY_URL` (defaults to `https://domains-api.theouthaven.com`)

Secrets:

- `AWS_PLATFORM_JOB_GATEWAY_SECRET` — high entropy, at least 32 characters
- `SUPABASE_SERVICE_ROLE_KEY`
- `DOMAIN_GATEWAY_SECRET`

The deployment workflow is restricted to AWS account `742020474738` and `us-east-1`.

## 1. Deploy the worker runtime with all traffic disabled

Run `AWS worker runtime` manually with:

- environment: `production`
- deploy: `true`
- enable_domain_lifecycle: `false`

This creates/deploys:

- HMAC platform job gateway
- SES SQS worker
- DynamoDB idempotency ledger
- registrar lifecycle SQS worker
- EventBridge Scheduler definition in `DISABLED` state

The workflow performs an authenticated job-gateway status smoke test.

## 2. SES prerequisite gate

Before changing `EMAIL_DELIVERY_MODE`, verify in the TheOutHaven AWS account:

- `theouthaven.com` is an SES verified identity or the exact sender identities are verified
- DKIM is healthy
- the SES account can send to the intended production recipients (not restricted by sandbox limitations)
- bounce/complaint monitoring is configured before broad volume
- sender addresses used by the application are authorized by the SES identity

Do not enable SES routing merely because the worker stack exists.

## 3. Configure Vercel job ingress, but keep Resend live

Set these server-only Vercel production values:

- `AWS_PLATFORM_JOB_GATEWAY_URL=<worker stack JobGatewayUrl output>`
- `AWS_PLATFORM_JOB_GATEWAY_SECRET=<same HMAC secret>`
- `EMAIL_DELIVERY_MODE=resend`

Deploy/redeploy the application.

At this point no application email is routed to SES.

## 4. Test SES with a controlled marketing campaign

Change:

`EMAIL_DELIVERY_MODE=hybrid`

Hybrid behavior in this phase:

- marketing email blast -> AWS job gateway -> SQS -> SES
- reservations -> Resend
- support -> Resend
- account/security -> Resend
- inbound email -> Resend

The marketing route writes `marketing_send_logs` as `pending` before enqueueing. The SES worker uses a deterministic idempotency key in DynamoDB to suppress routine SQS retry duplication and updates the send log to `sent` or `failed` after the SES API result.

Validate a small internal/test campaign before broader traffic.

Rollback:

`EMAIL_DELIVERY_MODE=resend`

No AWS infrastructure deletion is required.

## 5. Registrar lifecycle handoff to AWS

The AWS registrar worker handles only:

- uncertain registration reconciliation
- eligible renewals

It does not own customer website DNS/HTTPS health during the Lightsail/CloudFront migration.

### Cutover order

1. Deploy the AWS worker runtime with `enable_domain_lifecycle=false`.
2. Confirm the domain lifecycle Lambda can reach Supabase and `domains-api.theouthaven.com` in a controlled invocation/test.
3. Set Vercel production `DOMAIN_REGISTRAR_LIFECYCLE_MODE=aws` and redeploy.
4. Confirm the existing Vercel `/api/cron/domain-lifecycle` response reports `registrar_lifecycle_owner: aws` while it continues website health processing.
5. Re-run the `AWS worker runtime` deployment with `enable_domain_lifecycle=true`.
6. Confirm the EventBridge schedule is enabled and the domain lifecycle queue/worker is healthy.

This order creates a brief pause in registrar reconciliation rather than a duplicate-renewal window.

### Registrar rollback order

1. Re-deploy the AWS worker runtime with `enable_domain_lifecycle=false`.
2. Confirm the schedule is disabled and the domain lifecycle queue is drained/understood.
3. Set Vercel `DOMAIN_REGISTRAR_LIFECYCLE_MODE=vercel` and redeploy.
4. Confirm Vercel resumes registration reconciliation/renewal.

Never enable both owners intentionally.

## 6. Observability gates

Before considering the migration complete, surface at least:

- Email SQS visible messages / age
- Email DLQ visible messages
- SES Lambda errors/throttles
- SES bounce/complaint events
- Domain lifecycle queue / DLQ
- Domain lifecycle Lambda errors
- Last successful registrar lifecycle tick
- Marketing pending/sent/failed counts

These should ultimately appear in `/admin/dashboard` rather than requiring routine AWS Console use.

## 7. Remaining follow-on work

After this worker runtime is proven:

- SES event destinations for delivery/bounce/complaint/open/click normalization
- campaign completion reconciliation (`scheduled` -> `sent`/`failed`)
- email suppression/reputation dashboard
- move additional non-interactive jobs to their existing SQS queues
- CloudFront/S3 customer-domain migration and CDN health dashboard
