# TheOutHaven Mobile Beta Release Checklist

## Build configuration
- [ ] Run `npm install` in `mobile/` and commit the generated lockfile if the mobile package is installed independently.
- [ ] Run `npm run typecheck` from `mobile/`.
- [ ] Confirm the dedicated Mobile beta CI workflow is green on the release commit.
- [ ] Create/link an EAS project for bundle id/package `com.theouthaven.app` and confirm the project id is available to the build.
- [ ] Create a physical-device development build and a preview/internal build. Push notifications must be tested outside Expo Go.

## Required EAS environment
- [ ] `EXPO_PUBLIC_API_BASE_URL=https://theouthaven.com/api/mobile/v1`
- [ ] `EXPO_PUBLIC_SITE_URL=https://theouthaven.com`
- [ ] `EXPO_PUBLIC_SHORT_LINK_BASE_URL=https://outhvn.com`
- [ ] `EXPO_PUBLIC_SUPABASE_URL`
- [ ] `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `EXPO_PUBLIC_RELEASE_CHANNEL=preview` for beta and `production` for store builds
- [ ] `EXPO_PUBLIC_SENTRY_DSN`
- [ ] `SENTRY_AUTH_TOKEN` as a sensitive EAS secret for source-map upload
- [ ] `SENTRY_ORG` and `SENTRY_PROJECT` in the build environment

## Push notifications
- [x] Apply the `mobile_push_devices` / `mobile_push_deliveries` migration from PR 12 to Virginia production and Oregon DR.
- [ ] Configure Apple APNs credentials in EAS.
- [ ] Configure Android FCM credentials in EAS.
- [x] Reuse the existing server/AWS `CRON_SECRET` contract; no mobile-specific cron secret is required.
- [x] Route the existing 15-minute AWS reservation reminder wake through the durable background queue to `POST /api/cron/mobile-outing-reminders` while preserving the canonical 65-schedule footprint.
- [ ] Verify one 2-hour reminder and one 30-minute reminder on a physical iPhone.
- [ ] Verify one 2-hour reminder and one 30-minute reminder on a physical Android device.
- [ ] Verify tapping a reminder opens the exact `/outing/[id]/active` screen.
- [ ] Verify a successful reminder is not delivered twice when the worker retries.

## Deep links
- [ ] Verify `https://outhvn.com/.well-known/apple-app-site-association` is served with the final Apple Team ID + `com.theouthaven.app` app ID.
- [ ] Verify `https://outhvn.com/.well-known/assetlinks.json` is served with the final Android signing certificate SHA-256 fingerprint + `com.theouthaven.app`.
- [ ] Verify `outhvn.com/{code}` opens the exact native location/OUTing when installed and falls back to the equivalent web screen when not installed.

## Core consumer QA
- [ ] Guest can Home → PLAN → search → results without signing in.
- [ ] Authenticated user can save an OUTing and a favorite.
- [ ] Saved / Upcoming / Completed / Favorites persist after app restart.
- [ ] Active OUTing NOW / NEXT flow opens directions correctly.
- [ ] Completion feedback saves and optional reviews enter moderation.
- [ ] Light and dark appearance are readable on supported devices.
- [ ] VoiceOver and TalkBack can identify primary buttons, tabs, and rating controls.

## Observability
- [ ] Confirm a controlled test exception reaches Sentry with app version and release-channel tags.
- [ ] Confirm source maps symbolicate a preview-build exception.
- [ ] Confirm `mobile_push_opened` appears in canonical analytics.
- [ ] Confirm guest analytics uses anonymous identity and authenticated analytics uses user identity.
- [ ] Confirm no email, phone, service key, access token, or review text is attached to Sentry by default.

## Release gate
Beta is ready only when Mobile beta CI, iOS preview build, Android preview build, auth/search/save/active/completion smoke tests, push deep-link tests, and Sentry symbolication are all green.
