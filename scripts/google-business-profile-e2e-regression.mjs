import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
function requireText(source, text, message) {
  if (!source.includes(text)) throw new Error(message);
}

const migration = read("supabase/migrations/20260922234500_google_business_profile_connections.sql");
const runtime = read("lib/google/google-business-profile.ts");
const connect = read("apps/business/app/api/locations/google-business-profile/connect/route.ts");
const callback = read("apps/business/app/api/locations/google-business-profile/callback/route.ts");
const mapping = read("apps/business/app/api/locations/google-business-profile/map/route.ts");
const sync = read("apps/business/app/api/locations/google-business-profile/sync/route.ts");
const page = read("apps/business/app/locations/dashboard/social-accounts/page.tsx");
const card = read("apps/business/app/locations/dashboard/social-accounts/GoogleBusinessProfileCard.tsx");
const vault = read(".github/workflows/aws-credential-vault-runtime-sync.yml");

requireText(migration, "google_business_profile_connection_secrets", "GBP tokens must be isolated in a dedicated secrets table.");
requireText(migration, "enable row level security", "GBP tables must enable RLS.");
requireText(migration, "revoke all on public.google_business_profile_connection_secrets from anon, authenticated", "GBP secrets must never be exposed to browser roles.");

requireText(runtime, "https://www.googleapis.com/auth/business.manage", "GBP must request the current business.manage OAuth scope.");
requireText(runtime, "mybusinessaccountmanagement.googleapis.com/v1/accounts", "GBP must use the Account Management API for account discovery.");
requireText(runtime, "mybusinessbusinessinformation.googleapis.com/v1/", "GBP must use the Business Information API for location data.");
requireText(runtime, 'url.searchParams.set("readMask"', "GBP location reads must use an explicit readMask.");
requireText(runtime, 'url.searchParams.set("updateMask"', "GBP writes must use an explicit updateMask.");
requireText(runtime, 'createCipheriv("aes-256-gcm"', "GBP OAuth tokens must be encrypted at rest.");
requireText(runtime, "GOOGLE_CLIENT_ID", "GBP must consume vault-propagated Google OAuth credentials.");

for (const route of [connect, callback, mapping, sync]) {
  requireText(route, "requireOwnerOrAdminAccessToLocation", "Every GBP route must enforce location-scoped business authorization.");
}
requireText(connect, "resolveWebSurfaceAuthOrigin", "GBP OAuth must preserve the isolated Business surface callback origin.");
requireText(callback, "verifyGoogleBusinessState", "GBP callback must verify signed OAuth state.");
requireText(callback, "user.id !== state.userId", "GBP callback must bind OAuth state to the initiating session.");
requireText(callback, "google_place_id", "GBP callback should prefer canonical Place ID mapping.");
requireText(mapping, "candidate_locations", "Manual GBP mapping must be limited to authorized Google candidates.");

for (const action of ["refresh", "use_google", "use_theouthaven", "disconnect"]) {
  requireText(sync, `"${action}"`, `GBP sync route is missing the ${action} action.`);
}
requireText(sync, "reauthorization_required", "GBP sync must surface expired/revoked authorization.");
requireText(card, "Use TheOutHaven", "GBP mismatch UI must let the owner explicitly push TheOutHaven data.");
requireText(card, "Use Google", "GBP mismatch UI must let the owner explicitly pull Google data.");
requireText(page, "GoogleBusinessProfileCard", "Connected Accounts must surface GBP.");
requireText(vault, "'clientId':['GOOGLE_CLIENT_ID','GOOGLE_OAUTH_CLIENT_ID']", "AWS vault sync must propagate Google OAuth client ID.");
requireText(vault, "'clientSecret':['GOOGLE_CLIENT_SECRET','GOOGLE_OAUTH_CLIENT_SECRET']", "AWS vault sync must propagate Google OAuth client secret.");

console.log("Google Business Profile E2E regression checks passed.");
