# Social Manager provider setup

This is the one-time operator setup behind the user-facing **Connect Social Accounts** screen. Staff should never need to see app IDs, secrets, scopes, tokens, or webhook configuration.

## Instagram + Facebook (Meta)

The normal staff flow stays simple:

1. Open **Marketing → Social Accounts**.
2. Choose **Connect Instagram** or **Connect Facebook**.
3. Sign in with Meta.
4. Approve the requested access.
5. Return to TheOutHaven automatically.

For publishing and analytics, keep the currently approved Meta permissions in `META_SOCIAL_SCOPES`.

For Community comments/messages, the Meta app must also have the relevant reviewed permissions before adding them to `META_SOCIAL_SCOPES`:

- Facebook Page comments: `pages_manage_engagement` plus the read access required by the app's Page setup.
- Facebook Messenger: `pages_messaging` and the Page metadata access required for webhook subscription.
- Instagram comments through Facebook Login: `instagram_manage_comments`.
- Instagram messages through Facebook Login: `instagram_manage_messages`.

If the app instead uses Instagram Login, the equivalent permissions are `instagram_business_manage_comments` and `instagram_business_manage_messages`.

Do not request unapproved permissions in production just to make the UI say Community is ready. The Social Accounts screen reads the scopes actually granted and shows a plain-English readiness message.

### Meta webhook

The code endpoint is:

`https://theouthaven.com/api/webhooks/social/meta`

Configure a private `META_WEBHOOK_VERIFY_TOKEN` in the production environment and use the same value when Meta asks for the webhook verification token. The POST handler verifies Meta's `X-Hub-Signature-256` with `META_APP_SECRET` before accepting activity.

Subscribe only to fields/features the app has been approved to receive. Comments/messages received from Meta are normalized into the Social Manager Community inbox.

## TikTok

The staff flow is also one click:

1. Open **Marketing → Social Accounts**.
2. Choose **Connect TikTok**.
3. Sign in at TikTok.
4. Approve access.
5. Return to TheOutHaven automatically.

The existing integration uses TikTok Login Kit / Content Posting scopes for profile information, stats, the user's videos, direct posting and upload. TikTok requires app-side scope approval and the creator must authorize those scopes.

Do not present TikTok as having a general Community inbox or arbitrary public-consumer search through the standard commercial app scopes. Social Manager shows TikTok publishing/performance as ready when connected; additional TikTok features should only be enabled if TikTok explicitly grants the corresponding product/API access.

For public social-intent discovery beyond data exposed by owned connected accounts, use a provider-approved commercial social-listening source and feed normalized results into `ingestCommunityEvent(..., conversationType: "public_opportunity")` rather than scraping platforms.

## Safety

- Tokens remain server-side and encrypted through `marketing_social_connection_secrets`.
- Never log or expose access/refresh tokens to the admin UI.
- A red-risk Community conversation is always human-only.
- The Social Accounts page should say **Reconnect** rather than exposing token-expiry or OAuth terminology.
