# Platform DR credential authority

The production Virginia Supabase service-role credential is authoritative for AWS runtime workloads.

The production domain-gateway HMAC credential is authoritative in AWS Secrets Manager at `/theouthaven/production/domain-gateway/hmac` in `us-east-1`. GitHub and Vercel are not credential authorities for the domain gateway.

The live Lightsail gateway remains the protected OpenSRS boundary. During the one-time bootstrap only, the `AWS domain gateway credential authority` workflow may obtain temporary Lightsail SSH access, read the existing `DOMAIN_GATEWAY_SECRET` from `/opt/theouthaven-domain-gateway/.env` without logging it, seed or replace an unmarked legacy AWS secret, tag that secret `Authority=aws-canonical-v1`, and immediately remove the temporary Lightsail IAM permission. Once marked canonical, subsequent runs never copy a Lightsail value back into AWS.

The workflow validates the canonical AWS secret against authenticated `https://domains-api.theouthaven.com/v1/status`, then reasserts `DOMAIN_GATEWAY_URL` and `DOMAIN_GATEWAY_SECRET` into the shared AWS application environment. Secret values and HMAC signatures must never be logged.

The shared `/theouthaven/production/platform-dr/app-env` secret may be rebuilt as part of platform DR synchronization. After every successful main-branch DR sync:

- `AWS platform DR credential guard` reasserts the Virginia Supabase URL and service-role credential.
- `AWS domain gateway credential authority` reasserts the canonical AWS domain-gateway HMAC credential and forces a controlled background-runtime secret reload when drift is repaired.

Background cron ownership changes must not proceed unless both credential guards are healthy.

The separate `theouthaven-domains-gateway` Lightsail service remains intentionally narrow: it authenticates TheOutHaven requests and performs registrar/DNS operations against OpenSRS. Scheduling, lifecycle orchestration, retries, and durable delivery belong to EventBridge, SQS, and the shared AWS background runtime.

This file also provides a safe documentation-only trigger for guarded DR reconciliation verification.
