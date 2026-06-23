# TheOutHaven Supabase Edge Functions Setup

## Required environment variables

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`

## Optional environment variables

- `OPENAI_API_KEY`
- `SEARCH_LLM_MODEL`
- `GOOGLE_PLACES_API_KEY`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `ADMIN_EMAIL`
- `NEXT_PUBLIC_USE_EDGE_CREATE_SEARCH`

## Deploy commands

```bash
supabase functions deploy health-check
supabase functions deploy parse-search-intent
supabase functions deploy create-search
supabase functions deploy nightly-photo-backfill
supabase functions deploy admin-cron-digest-email
supabase functions deploy beta-tester-reminders
supabase functions deploy admin-crm-list
```

## Secrets commands

```bash
supabase secrets set CRON_SECRET="replace-me"
supabase secrets set OPENAI_API_KEY="replace-me"
supabase secrets set GOOGLE_PLACES_API_KEY="replace-me"
supabase secrets set RESEND_API_KEY="replace-me"
supabase secrets set EMAIL_FROM="TheOutHaven <no-reply@theouthaven.com>"
supabase secrets set ADMIN_EMAIL="admin@theouthaven.com"
```

## Local serve commands

```bash
supabase functions serve health-check
supabase functions serve create-search
supabase functions serve nightly-photo-backfill --no-verify-jwt
```

## Enable Edge Create Search

Set `NEXT_PUBLIC_USE_EDGE_CREATE_SEARCH=true` in the Next.js environment. When false or unset, `/api/generate` continues to use the legacy enterprise search flow. If the Edge Function fails, the route gracefully falls back to legacy search unless `disableLegacyFallback` is sent.

## Curl examples

```bash
curl "$SUPABASE_URL/functions/v1/health-check"
```

```bash
curl -X POST "$SUPABASE_URL/functions/v1/parse-search-intent" \
  -H "Content-Type: application/json" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -d '{"prompt":"steak dinner with bowling in Astoria","debug":true}'
```

```bash
curl -X POST "$SUPABASE_URL/functions/v1/create-search" \
  -H "Content-Type: application/json" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -d '{"prompt":"steak dinner with bowling in Astoria","limit":12,"debug":true}'
```

```bash
curl -X POST "$SUPABASE_URL/functions/v1/nightly-photo-backfill" \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: $CRON_SECRET" \
  -d '{"source":"cron","batchSize":25,"dryRun":true}'
```

```bash
curl -X POST "$SUPABASE_URL/functions/v1/admin-cron-digest-email" \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: $CRON_SECRET" \
  -d '{"hours":24,"sendEmail":false}'
```

## Cron setup

Run `supabase/sql/setup-edge-function-crons.sql` after replacing `YOUR_PROJECT_REF` and `YOUR_CRON_SECRET`. Prefer Supabase Vault for production secrets if available.


## Disabled beta tester reminders

`beta-tester-reminders` is disabled and replaced by the Next.js `/api/cron/beta-reminders` system. Do not deploy or schedule it for active email sending.
