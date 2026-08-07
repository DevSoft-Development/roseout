# Reservation cron prelaunch audit

Date: 2026-08-07 UTC

## Production drift found

The reservation cron registry and pg_cron schedules existed, but the deployed Edge Functions for:

- `reservation-reminder-cron`
- `reservation-status-cleanup`
- `reservation-daily-digest`

had drifted from the repository. Production was still running placeholder `Hello from Functions!` implementations with `verify_jwt=true`, while `supabase/config.toml` requires these cron functions to deploy with `verify_jwt=false` and authenticate internally with `x-cron-secret` through `requireAdminOrCron`.

The pg_cron wrapper reported successful runs because `pg_net` accepted the HTTP requests, while Edge Function runtime logs showed HTTP 401 responses. A pg_cron enqueue success therefore was not proof that reservation maintenance executed.

## Production repair completed during audit

The three real repository implementations were deployed to the linked Supabase project with `verify_jwt=false` and internal cron-secret authorization preserved.

Non-destructive verification used the already scheduled cron requests:

- `reservation-reminder-cron`: executed successfully with `authSource=cron`; no due reminders were present.
- `reservation-status-cleanup`: dry run executed successfully with `authSource=cron`; 36 stale reservation candidates were identified and zero mutations were requested by the audit.
- `reservation-daily-digest`: executed successfully with `authSource=cron` and `sendEmail=false`; the digest generated without sending email.

## Security correction

The shared Edge Function admin authorization helper must not accept roles from `user_metadata`, because users can edit that metadata. Admin authorization is limited to trusted `app_metadata` or protected role tables.

## Remaining reservation prelaunch work

This audit does not declare the reservation system launch-ready. The next reservation tasks are:

1. Remove credential/config drift from pg_cron scheduling. Live database settings expected by the migration are missing, while current scheduled commands contain an embedded cron credential. Replace this with the approved secret-storage/configuration path and rotate the affected cron credential.
2. Make reservation reminder and cleanup datetime calculations explicitly `America/New_York` aware rather than relying on runtime-local parsing.
3. Keep customer reservation-management tokens valid through the reservation lifecycle instead of expiring a fixed 72 hours after booking.
4. Run browser/API E2E coverage for create, confirmation, cancellation, waitlist, reminder, cleanup, and admin management flows.
5. Verify real email/SMS delivery and overnight digest recipient configuration.

No database schema change is included in this PR.
