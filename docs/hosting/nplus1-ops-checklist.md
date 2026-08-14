## Deployment checklist

- Apply `supabase/migrations/20260814150500_website_hosting_replica_pool.sql`.
- Ensure `WEBSITE_HOSTING_GATEWAY_SECRET` is configured in the web app and matches the standby gateway.
- Ensure `VERCEL_API_TOKEN` and `VERCEL_TEAM_ID` can read and update DNS for `theouthaven.com`.
- Confirm Ohio heartbeat remains healthy and its `deploy_url` is HTTPS.
- Publish a platform-domain test site and confirm a synced replica row exists.
- Run the replica-repair cron and confirm it is idempotent.
- Test custom-domain failover.
- Test guarded `*.theouthaven.com` failover only after platform replica coverage is complete.
