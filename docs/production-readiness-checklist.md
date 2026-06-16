# Production Readiness Checklist

## Security and secrets
- [x] Remove hardcoded Supabase credentials from `next.config.ts`.
- [ ] Confirm no real secrets are committed after final key rotation.
- [ ] Before public launch, rotate all secret keys, including Supabase service role keys, Supabase anon keys if exposed, cron secrets, import secrets, Resend/API keys, OpenAI keys, Google Places/Maps keys, Twilio keys, OAuth secrets, webhook secrets, Turnstile keys, and any credentials previously pasted into code, chat, terminal output, screenshots, or docs.

## Environment variables
- [x] Keep `.env.example` placeholder-only and complete.
- [ ] Configure production values in Vercel/Supabase only.

## Admin route protection
- [x] Audit admin API route protections.
- [ ] Manually review any routes marked in the audit report.

## Supabase migrations
- [ ] Confirm invalid legacy migration filenames were not already applied before renaming.
- [ ] Run Supabase CLI migration status against production/staging.

## Search quality
- [x] Preserve mixed-outing detection for dinner/activity prompts.
- [ ] Continue beta search feedback review.

## Build/deployment
- [ ] Run strict production gate before launch.
- [ ] Confirm Vercel runtime env vars and image domains.

## Analytics and monitoring
- [ ] Confirm search health, admin logs, and error reporting.

## Email/SMS/cron
- [ ] Verify Resend, Twilio, cron, import, and digest secrets in production.

## Claim QR flow
- [ ] Validate generated QR domains and legacy roseout.com redirects before launch.

## Mobile QA
- [ ] Smoke test critical mobile flows on iOS and Android.

## Machine learning readiness later
- [ ] Start only after clean data, strong search rules, feedback tracking, beta tester results, and stable pairing/ranking logic.
- [ ] Later ML should cover ranking, personalization, smarter mixed-outing pairings, category correction, bad-data detection, and learning from user clicks/saves/bookings/feedback.

## Final pre-launch key rotation
- [ ] Rotate every production secret immediately before public launch.
