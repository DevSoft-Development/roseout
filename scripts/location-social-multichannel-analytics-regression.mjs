import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
}
function requireText(source, text, message) {
  if (!source.includes(text)) throw new Error(message);
}

const route = read("apps/business/app/api/locations/social/metrics/sync/route.ts");
const studio = read("apps/business/app/locations/dashboard/marketing-studio/page.tsx");
const syncControl = read("components/marketing/LocationSocialInsightsSync.tsx");
const metrics = read("lib/marketing/social-metrics.ts");
const tokens = read("lib/marketing/social-token-access.ts");
const publishing = read("lib/marketing/social-publishing.ts");

requireText(route, 'permission: "marketing.edit"', "Metrics sync must require marketing.edit.");
requireText(route, '.eq("scope", "location")', "Metrics sync must be limited to location-scoped connections.");
for (const provider of ["instagram", "facebook", "tiktok", "youtube"]) {
  requireText(route, `"${provider}"`, `Metrics sync must support ${provider}.`);
}
requireText(route, "ingestSocialMetrics(connection.id)", "Metrics sync must reuse canonical ingestion.");
requireText(syncControl, "/api/locations/social/metrics/sync", "Marketing Studio sync control must call the unified endpoint.");
requireText(syncControl, "Sync all insights", "Marketing Studio must expose one multi-channel sync action.");

requireText(studio, "Social performance", "Marketing Studio must expose unified social performance.");
requireText(studio, "Connected channels", "Marketing Studio KPI must reflect connected channels.");
requireText(studio, "Known provider metrics", "Cross-provider totals must be labeled as known/available metrics.");
requireText(studio, "Subscribers", "YouTube audience terminology must remain provider-specific.");
if (studio.includes('label="Followers"') || studio.includes('label="Reach"')) {
  throw new Error("Marketing Studio must not present unlike cross-provider follower or reach totals as a single KPI.");
}
requireText(studio, "Shares", "Recent post analytics must surface shares when available.");
requireText(studio, "Clicks", "Recent post analytics must surface clicks when available.");

requireText(metrics, 'provider === "youtube"', "Canonical metrics ingestion must retain YouTube support.");
requireText(metrics, 'provider === "tiktok"', "Canonical metrics ingestion must retain TikTok support.");
requireText(metrics, 'provider === "instagram"', "Canonical metrics ingestion must retain Instagram support.");
requireText(metrics, "graph.facebook.com", "Canonical metrics ingestion must retain Facebook support.");
requireText(metrics, 'from("social_account_metric_snapshots")', "Account metrics must continue using canonical snapshots.");
requireText(metrics, 'from("social_post_metric_snapshots")', "Post metrics must continue using canonical snapshots.");
requireText(metrics, "socialAccessToken(connection)", "Metrics must use shared refresh-aware token access.");
requireText(publishing, "socialAccessToken(connection)", "Publishing must use shared refresh-aware token access.");
requireText(tokens, 'connection.provider === "tiktok"', "Shared token access must refresh TikTok.");
requireText(tokens, 'connection.provider === "youtube"', "Shared token access must refresh YouTube.");
requireText(tokens, 'status: "reauthorization_required"', "Expired non-refreshable tokens must require reconnection.");

console.log("Multi-channel social analytics regression checks passed.");
