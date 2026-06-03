# TheOutHaven Edge Functions Setup

This repo now includes a starter Supabase Edge Functions setup.

## Functions added

- `health-check`
- `parse-search-intent`
- `create-search`
- `nightly-photo-backfill`
- `admin-cron-digest-email`
- `beta-tester-reminders`
- `admin-crm-list`

## Required secrets

```bash
supabase secrets set CRON_SECRET="replace-me"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="replace-me"
```

Supabase usually provides `SUPABASE_URL` automatically in hosted functions, but set it manually if local testing needs it.

## Optional secrets

```bash
supabase secrets set OPENAI_API_KEY="replace-me"
supabase secrets set GOOGLE_PLACES_API_KEY="replace-me"
supabase secrets set RESEND_API_KEY="replace-me"
supabase secrets set EMAIL_FROM="TheOutHaven <no-reply@theouthaven.com>"
supabase secrets set ADMIN_EMAIL="admin@theouthaven.com"
supabase secrets set SITE_URL="https://theouthaven.com"
```

## Deploy functions

```bash
supabase functions deploy health-check
supabase functions deploy parse-search-intent
supabase functions deploy create-search
supabase functions deploy nightly-photo-backfill
supabase functions deploy admin-cron-digest-email
supabase functions deploy beta-tester-reminders
supabase functions deploy admin-crm-list
```

## Test locally

```bash
supabase functions serve health-check
curl -i http://127.0.0.1:54321/functions/v1/health-check
```

## Test deployed health check

```bash
curl -i https://YOUR_PROJECT_REF.supabase.co/functions/v1/health-check
```

For your current project ref, this may be:

```bash
curl -i https://hnhbzynoyrhjndefbwkh.supabase.co/functions/v1/health-check
```

## Test create-search

This function has JWT verification enabled. Call it from the app using Supabase client auth, or temporarily serve locally while testing.

Expected test query:

```json
{
  "prompt": "steak dinner with bowling in Astoria",
  "debug": true
}
```

Expected behavior:

- Parser source should be `fast_parser` or `cache`.
- `llm_used` should be false for this simple query.
- Restaurant results should require steak/steakhouse matching.
- Activity results should require bowling matching.
- Theater results should be excluded.

## Enable Edge Search in the app

Add this to your frontend environment after testing:

```env
NEXT_PUBLIC_USE_EDGE_CREATE_SEARCH=true
```

The helper files are present at:

- `lib/edge-functions.ts`
- `lib/search/createSearch.ts`

You still need to wire the helper into the exact current `/create` search flow if it is not already using a centralized search helper.

## Cron setup

See:

```txt
supabase/sql/setup-edge-function-crons.sql
```

Replace:

- `YOUR_PROJECT_REF`
- `YOUR_CRON_SECRET`

Then run the SQL in Supabase SQL editor.

## Migration

Run the migration:

```bash
supabase db push
```

Or paste/run:

```txt
supabase/migrations/202606020001_edge_functions_foundation.sql
```

