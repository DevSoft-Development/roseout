# Production Admin API Audit

| Route | Methods | Protection | Service role | Writes data | Cron/import/internal | Manual review |
|---|---:|---|---|---|---|---|
| app/api/admin/activities/[id]/route.ts | GET, PATCH | admin role | yes | yes | no | no |
| app/api/admin/activities/route.ts | POST | admin role | yes | yes | no | no |
| app/api/admin/backfill-reservation-links/route.ts | GET | admin role | yes | yes | yes | no |
| app/api/admin/backfill-review-counts/route.ts | GET, POST | admin role | yes | yes | yes | no |
| app/api/admin/beta/applications/route.ts | GET, PATCH | admin role | yes | yes | no | no |
| app/api/admin/beta/bugs/route.ts | GET, PATCH | admin role | yes | yes | no | no |
| app/api/admin/beta/custom-prompts/route.ts | GET | admin role | yes | no | no | no |
| app/api/admin/beta/feedback/route.ts | GET, PATCH | admin role | yes | yes | no | no |
| app/api/admin/beta/overview/route.ts | GET | admin role | yes | no | no | no |
| app/api/admin/beta/reminders/route.ts | GET, POST | admin role | yes | yes | no | no |
| app/api/admin/beta/search-lab/route.ts | POST | admin role | no | yes | no | no |
| app/api/admin/beta/search-speed/route.ts | GET | admin role | yes | no | no | no |
| app/api/admin/beta/tasks/route.ts | GET, POST, PATCH | admin role | yes | yes | no | no |
| app/api/admin/beta/testers/route.ts | GET, PATCH, POST | admin role | yes | yes | no | no |
| app/api/admin/beta/turnstile-status/route.ts | GET | admin role | yes | no | no | no |
| app/api/admin/business-analytics/route.ts | GET | admin role | yes | no | no | no |
| app/api/admin/businesses/[id]/notes/route.ts | GET, POST | admin role | yes | yes | no | no |
| app/api/admin/businesses/[id]/outreach/route.ts | GET, POST | admin role | yes | yes | no | no |
| app/api/admin/businesses/[id]/reservation-link/route.ts | PATCH, POST | admin role | yes | yes | no | no |
| app/api/admin/businesses/[id]/route.ts | GET, PATCH | admin role | yes | yes | no | no |
| app/api/admin/campaigns/route.ts | GET, POST | admin role | yes | yes | no | no |
| app/api/admin/claim-tools/regenerate/route.ts | POST | admin role | yes | yes | no | no |
| app/api/admin/claim-tools/route.ts | GET | admin role | no | no | no | no |
| app/api/admin/claims/route.ts | GET | admin role | yes | no | no | no |
| app/api/admin/claims/update/route.ts | POST | admin role | yes | yes | no | no |
| app/api/admin/cleanup-locations/route.ts | GET, POST | admin role | yes | yes | yes | no |
| app/api/admin/communication/search/route.ts | GET | admin role | no | no | no | no |
| app/api/admin/communication/send/route.ts | POST | admin role | no | yes | no | no |
| app/api/admin/communication/templates/route.ts | GET, POST | admin role | no | yes | no | no |
| app/api/admin/create-user/route.ts | POST | admin role | yes | yes | no | no |
| app/api/admin/email-digests/send/route.ts | POST | admin role | no | yes | yes | no |
| app/api/admin/email-templates/preview/route.ts | POST | admin role | no | yes | no | no |
| app/api/admin/engagement/route.ts | GET | manual review | yes | no | no | yes |
| app/api/admin/feature-flags/[id]/route.ts | PATCH | admin role | yes | yes | no | no |
| app/api/admin/feature-flags/[id]/toggle/route.ts | POST | admin role | yes | yes | no | no |
| app/api/admin/feature-flags/audit-logs/route.ts | GET | admin role | yes | no | no | no |
| app/api/admin/feature-flags/route.ts | GET, POST | admin role | yes | yes | no | no |
| app/api/admin/featured-outings/route.ts | GET, POST, PATCH | admin role | yes | yes | no | no |
| app/api/admin/giveaway/entries/[id]/route.ts | PATCH, DELETE | admin role | yes | yes | no | no |
| app/api/admin/giveaway/entries/route.ts | GET | admin role | yes | no | no | no |
| app/api/admin/giveaway/send-user-reminders/route.ts | POST | admin role | yes | yes | no | no |
| app/api/admin/impersonate/route.ts | POST | admin role | yes | yes | no | no |
| app/api/admin/impersonation/start/route.ts | none | manual review | no | no | no | yes |
| app/api/admin/import-logs/route.ts | GET | manual review | yes | no | yes | yes |
| app/api/admin/invites/route.ts | POST | manual review | yes | yes | no | yes |
| app/api/admin/knowledge-base/ai/route.ts | POST | admin role | yes | yes | no | no |
| app/api/admin/knowledge-base/articles/[id]/route.ts | GET, PATCH, DELETE | admin role | yes | yes | no | no |
| app/api/admin/knowledge-base/articles/route.ts | GET, POST | admin role | yes | yes | no | no |
| app/api/admin/knowledge-base/categories/route.ts | GET, POST | admin role | yes | yes | no | no |
| app/api/admin/knowledge-base/feedback/route.ts | POST | manual review | yes | yes | no | yes |
| app/api/admin/knowledge-base/templates/render/route.ts | POST | admin role | yes | yes | no | no |
| app/api/admin/live-sessions/route.ts | GET | admin role | no | no | no | no |
| app/api/admin/location-growth/backfill-one-photo/route.ts | POST | manual review | yes | yes | yes | yes |
| app/api/admin/location-growth/cache-google-photos/route.ts | POST | manual review | yes | yes | no | yes |
| app/api/admin/location-growth/cache-one-google-photo/route.ts | POST | manual review | yes | yes | no | yes |
| app/api/admin/location-growth/classify-chains/route.ts | POST | admin role | yes | yes | yes | no |
| app/api/admin/location-growth/dedupe/route.ts | POST | admin role | yes | yes | yes | no |
| app/api/admin/location-growth/duplicates/decision/route.ts | POST | admin role | yes | yes | yes | no |
| app/api/admin/location-growth/duplicates/route.ts | GET | admin role | yes | no | yes | no |
| app/api/admin/location-growth/enrich-high-value/route.ts | POST | admin role | yes | yes | yes | no |
| app/api/admin/location-growth/generate-missing-qrs/route.ts | POST | admin role | no | yes | yes | no |
| app/api/admin/location-growth/import-nyc-restaurants/route.ts | POST | admin role | no | yes | yes | no |
| app/api/admin/location-growth/import-osm-activities/route.ts | POST | admin role | no | yes | yes | no |
| app/api/admin/location-growth/low-level-cleanup/route.ts | POST | admin role | yes | yes | no | no |
| app/api/admin/location-growth/migrate-enriched-photos/route.ts | POST | admin role | yes | yes | yes | no |
| app/api/admin/location-growth/missing-photo-diagnostics/route.ts | GET | admin role | yes | no | yes | no |
| app/api/admin/location-growth/photo-debug/route.ts | GET | manual review | yes | no | no | yes |
| app/api/admin/location-growth/publish/route.ts | POST | admin role | yes | yes | yes | no |
| app/api/admin/location-growth/restore-low-level/route.ts | POST | admin role | yes | yes | no | no |
| app/api/admin/location-growth/score-staged/route.ts | POST | admin role | yes | yes | yes | no |
| app/api/admin/location-growth/staging/route.ts | GET | admin role | yes | no | yes | no |
| app/api/admin/location-growth/summary/route.ts | GET | admin role | yes | no | yes | no |
| app/api/admin/location-growth/test-osm/route.ts | POST | admin role | no | yes | yes | no |
| app/api/admin/location-images/cache-batch/route.ts | POST | manual review | yes | yes | no | yes |
| app/api/admin/location-images/cache-one/route.ts | POST | manual review | yes | yes | no | yes |
| app/api/admin/locations/[locationId]/photos/upload/route.ts | POST | admin role | yes | yes | no | no |
| app/api/admin/locations/[locationId]/summary/route.ts | GET | manual review | yes | no | no | yes |
| app/api/admin/locations/backfill-food-terms/route.ts | POST | admin role | yes | yes | yes | no |
| app/api/admin/locations/backfill-qr/route.ts | GET, POST | admin role | no | yes | yes | no |
| app/api/admin/locations/cleanup-missing-address/route.ts | POST | admin role | yes | yes | no | no |
| app/api/admin/locations/google-enrichment/route.ts | POST | admin role | no | yes | yes | no |
| app/api/admin/locations/google-food-suggestions/apply/route.ts | POST | admin role | yes | yes | no | no |
| app/api/admin/locations/search/route.ts | GET | manual review | yes | no | no | yes |
| app/api/admin/logs/route.ts | GET | admin role | yes | no | no | no |
| app/api/admin/marketing/audience/route.ts | GET, POST | admin role | yes | yes | no | no |
| app/api/admin/marketing/campaigns/[id]/route.ts | GET, PATCH, DELETE | admin role | yes | yes | no | no |
| app/api/admin/marketing/campaigns/route.ts | GET, POST | admin role | yes | yes | no | no |
| app/api/admin/marketing/email/send/route.ts | POST | admin role | yes | yes | no | no |
| app/api/admin/marketing/settings/route.ts | GET, POST, PATCH | admin role | yes | yes | no | no |
| app/api/admin/marketing/sms/send/route.ts | POST | admin role | yes | yes | no | no |
| app/api/admin/marketing/social/generate/route.ts | POST | admin role | yes | yes | no | no |
| app/api/admin/promo-codes/[id]/redemptions/route.ts | GET | admin role | yes | no | no | no |
| app/api/admin/promo-codes/[id]/route.ts | GET, PATCH, DELETE | admin role | yes | yes | no | no |
| app/api/admin/promo-codes/generate/route.ts | POST | admin role | no | yes | no | no |
| app/api/admin/promo-codes/route.ts | GET, POST | admin role | yes | yes | no | no |
| app/api/admin/rankings/recalculate/route.ts | POST | admin role | no | yes | no | no |
| app/api/admin/recalculate-scores/route.ts | POST | manual review | yes | yes | no | yes |
| app/api/admin/reservation-opportunities/[id]/route.ts | PATCH | admin role | yes | yes | no | no |
| app/api/admin/reservation-opportunities/route.ts | GET | admin role | yes | no | no | no |
| app/api/admin/restaurants/[id]/route.ts | GET, PATCH | admin role | yes | yes | no | no |
| app/api/admin/restaurants/backfill-cuisine/route.ts | POST | admin role | yes | yes | yes | no |
| app/api/admin/restaurants/backfill-qr/route.ts | GET, POST | admin role | no | yes | yes | no |
| app/api/admin/restaurants/enrich-google-metadata/route.ts | POST | admin role | yes | yes | yes | no |
| app/api/admin/restaurants/route.ts | GET, POST | admin role | yes | yes | no | no |
| app/api/admin/reviews/[reviewId]/route.ts | PATCH | admin role | yes | yes | no | no |
| app/api/admin/reviews/route.ts | GET | admin role | yes | no | no | no |
| app/api/admin/run-google-import/route.ts | GET, POST | secret header | no | yes | yes | no |
| app/api/admin/search/route.ts | GET | admin role | no | no | no | no |
| app/api/admin/search-health/[id]/route.ts | GET, PATCH | admin role | yes | yes | no | no |
| app/api/admin/search-health/batch-run/route.ts | POST | admin role | no | yes | no | no |
| app/api/admin/search-health/qa-prompts/route.ts | GET | admin role | no | no | no | no |
| app/api/admin/search-health/route.ts | GET | admin role | yes | no | no | no |
| app/api/admin/search-health/send-digest/route.ts | POST | admin role | no | yes | yes | no |
| app/api/admin/search-health/test-event/route.ts | POST | admin role | no | yes | no | no |
| app/api/admin/search-locations/route.ts | GET | admin role | no | no | no | no |
| app/api/admin/search-qa/route.ts | POST | admin role | no | yes | no | no |
| app/api/admin/search-users/route.ts | GET | admin role | no | no | no | no |
| app/api/admin/semantic-nightly/route.ts | GET, POST | admin role | yes | yes | yes | no |
| app/api/admin/send-restaurant-link/route.ts | POST | manual review | yes | yes | no | yes |
| app/api/admin/seo/audit/route.ts | POST | admin role | yes | yes | no | no |
| app/api/admin/seo/issues/route.ts | GET | admin role | yes | no | no | no |
| app/api/admin/seo/runs/route.ts | GET | admin role | yes | no | no | no |
| app/api/admin/seo/setup/route.ts | POST | admin role | yes | yes | no | no |
| app/api/admin/session/route.ts | POST | admin role | yes | yes | no | no |
| app/api/admin/stop-impersonation/route.ts | POST | manual review | no | yes | no | yes |
| app/api/admin/support-tickets/[id]/reply/route.ts | POST | admin role | no | yes | no | no |
| app/api/admin/support-tickets/route.ts | GET, POST | admin role | no | yes | no | no |
| app/api/admin/sync-locations/route.ts | GET, POST | manual review | yes | yes | yes | yes |
| app/api/admin/team/create-superadmin-profile/route.ts | POST | admin role | yes | yes | no | no |
| app/api/admin/team/members/route.ts | POST | admin role | yes | yes | no | no |
| app/api/admin/team/review-item/route.ts | POST | admin role | yes | yes | no | no |
| app/api/admin/team/work-sessions/route.ts | PATCH | admin role | yes | yes | no | no |
| app/api/admin/users/create-invite/route.ts | POST | admin role | yes | yes | no | no |
| app/api/admin/users/resend-password-invite/route.ts | POST | admin role | yes | yes | no | no |
| app/api/admin/users/route.ts | GET, POST, PATCH, DELETE | admin role | yes | yes | no | no |
| app/api/admin/users/search/route.ts | GET | admin role | no | no | no | no |
| app/api/admin/workspace/assign-locations/route.ts | POST | admin role | no | yes | no | no |
| app/api/admin/workspace/assign-locations/search/route.ts | GET | admin role | no | no | no | no |
