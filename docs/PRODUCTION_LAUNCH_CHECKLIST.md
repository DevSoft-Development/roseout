# TheOutHaven Production Launch Checklist

## Security
- Confirm all `app/api/admin/**`, `app/api/cron/**`, and internal mutation/import routes require admin, owner/admin, or cron authorization.
- Confirm cron endpoints reject requests without `CRON_SECRET`.
- Confirm service-role clients are only used on the server.

## Supabase migrations
- Apply all pending migrations, including canonical `public.locations` admin-edit field parity.
- Reload PostgREST schema cache after migrations.
- Back up production before launch and before importer/backfill runs.

## Vercel environment
- Set Supabase URL/anon/service role keys, `CRON_SECRET`, email/SMS provider keys, Stripe keys, OAuth secrets, and public site URL.
- Verify scheduled jobs run in the intended order.

## Stripe, Email, SMS, Cron, Search, Analytics, Reservations
- Verify Stripe webhook signature validation and webhook idempotency.
- Verify Resend/Twilio sender domains and failure alerts.
- Verify search quality smoke tests and zero-result recovery.
- Verify analytics writes to the canonical analytics event system.
- Verify reservations cannot double-book the same active slot.

## Rollback and backup
- Keep the previous Vercel deployment available for instant rollback.
- Keep a database backup snapshot from immediately before launch.
- Document importer re-run and recovery steps.

## Final key-rotation reminder
Before final public launch, rotate all secret keys that may have been pasted, logged, shared, or exposed during development: Supabase service role keys, Supabase anon keys if needed, `CRON_SECRET`, Resend/API keys, OAuth secrets, webhook secrets, Stripe keys/webhook secret, Turnstile keys, Twilio keys, and any other credentials.
