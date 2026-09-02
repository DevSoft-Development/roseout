# Platform DR credential authority

The production Virginia Supabase service-role credential is authoritative for AWS runtime workloads.

The production GitHub environment secret `DOMAIN_GATEWAY_SECRET` is the credential authority for authenticated calls to `https://domains-api.theouthaven.com`. The `AWS domain gateway credential authority` workflow validates that secret against the live gateway before copying it into the shared AWS application environment. Secret values and signatures must never be logged.

The shared `/theouthaven/production/platform-dr/app-env` secret may be rebuilt as part of platform DR synchronization. After every successful main-branch DR sync:

- `AWS platform DR credential guard` reasserts the Virginia Supabase URL and service-role credential.
- `AWS domain gateway credential authority` reasserts `DOMAIN_GATEWAY_URL` and the verified domain-gateway HMAC credential, then forces a controlled background-runtime secret reload when drift was repaired.

Background cron ownership changes must not proceed unless both credential guards are healthy.

This file also provides a safe documentation-only trigger for guarded DR reconciliation verification.
