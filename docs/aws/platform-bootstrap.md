# TheOutHaven AWS platform bootstrap

This document covers the one-time prerequisites for deploying the new AWS platform stacks from GitHub Actions.

## Safety model

The new infrastructure does not receive production website traffic merely by merging this PR.

- `WEBSITE_HOSTING_MODE` defaults to `lightsail`.
- The AWS foundation and website-hosting workflows require manual `workflow_dispatch` with `deploy=true`.
- The workflows are restricted to AWS account `742020474738`.
- Customer website DNS remains on the existing hosting path until an explicit migration step changes it.

## 1. Bootstrap the GitHub OIDC deploy role

Deploy `infra/aws/cloudformation/github-platform-deploy-role.yml` once in AWS account `742020474738` using an AWS administrator or an existing bootstrap role.

The stack creates:

- `TheOutHavenGitHubPlatformDeployRole`
- trust limited to `DevSoft-Development/roseout`
- GitHub environments `production` and `staging`
- permissions scoped to the AWS services used by the platform stacks

Set the resulting role ARN as the GitHub environment/repository variable:

`AWS_PLATFORM_DEPLOY_ROLE_ARN`

## 2. Configure foundation variables

Configure unique bucket names as GitHub environment/repository variables:

- `AWS_SITES_BUCKET`
- `AWS_MEDIA_BUCKET`

Optional:

- `AWS_PLATFORM_ALERT_EMAIL`

Do not reuse the backup bucket for customer website or media delivery.

## 3. Configure the website-hosting HMAC secret

Create a high-entropy secret of at least 32 characters and store it as the GitHub environment secret:

`AWS_WEBSITE_HOSTING_GATEWAY_SECRET`

The runtime deployment stores the same value in AWS Secrets Manager for the Lambda gateway.

Do not commit this value.

## 4. Deploy the foundation

Run the `AWS platform foundation` workflow manually:

- environment: `production`
- deploy: `true`

This creates the shared private S3 buckets, CloudFront tenant-only distribution, queue/DLQ foundation, scheduler group, SES configuration set, and monitoring topic.

## 5. Deploy the website hosting runtime

Run the `AWS website hosting runtime` workflow manually:

- environment: `production`
- deploy: `true`

The workflow resolves the foundation stack outputs, creates the CloudFront connection group and Lambda Function URL gateway, packages a pinned Boto3 runtime, deploys the gateway code, and performs an authenticated `/v1/status` smoke test.

Record the workflow outputs:

- Website hosting gateway URL
- CloudFront connection-group routing endpoint

## 6. Configure Vercel without changing traffic

Add these server-only environment values to the TheOutHaven Vercel project:

- `AWS_WEBSITE_HOSTING_GATEWAY_URL=<gateway Function URL>`
- `AWS_WEBSITE_HOSTING_GATEWAY_SECRET=<same HMAC secret>`
- `WEBSITE_HOSTING_MODE=dual`

`dual` keeps Lightsail as the live production publisher while shadow-publishing the same generated release to S3/CloudFront.

Do not set `WEBSITE_HOSTING_MODE=cloudfront_s3` yet.

## 7. Validate dual publishing

For a controlled test website, confirm:

- Lightsail publish still succeeds.
- A matching immutable release exists at `websites/<website-id>/releases/<version>/` in the private sites bucket.
- A CloudFront distribution tenant exists for the website.
- The tenant parameter points to the expected release prefix.
- The tenant-specific invalidation is accepted after publish.
- The returned routing endpoint matches the connection group.
- Existing public DNS is unchanged.

## 8. Domain and TLS migration

After dual publishing is proven, migrate one controlled domain to the CloudFront connection-group endpoint.

For Route 53 managed DNS, use Route 53 Alias records so the zone apex can target the CloudFront distribution tenant endpoint.

For external DNS providers, use provider-supported ALIAS/ANAME flattening at the apex when available, or use a `www` CNAME strategy. Do not assume a standard CNAME can be created at the zone apex.

The OpenSRS registrar relationship remains separate from the hosting origin. The existing `theouthaven-domains-gateway` continues to own registration, renewal, registrar status, reconciliation, and OpenSRS-facing operations.

## 9. Promote only after production QA

Set:

`WEBSITE_HOSTING_MODE=cloudfront_s3`

only after a controlled production site passes:

- root and `www` behavior
- TLS
- mobile rendering
- reservation/group-booking widgets
- events/experiences links
- media loading
- analytics
- publish version switching
- rollback
- cache invalidation
- domain verification

Lightsail should remain available during the initial promotion period.
