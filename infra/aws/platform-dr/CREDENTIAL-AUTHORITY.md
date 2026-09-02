# Platform DR credential authority

The production Virginia Supabase service-role credential is authoritative for AWS runtime workloads.

The shared `/theouthaven/production/platform-dr/app-env` secret may be rebuilt as part of platform DR synchronization, but the `AWS platform DR credential guard` must reassert the Virginia Supabase URL and service-role credential after every successful DR sync before background cron ownership changes proceed.

This file also provides a safe documentation-only trigger for the guarded DR reconciliation path during Batch 12 verification.
