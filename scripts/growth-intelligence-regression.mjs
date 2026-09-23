import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
}
function requireText(source, text, message) {
  if (!source.includes(text)) throw new Error(message);
}

const intelligence = read("lib/analytics/growth-intelligence.ts");
const analyticsPage = read("apps/business/app/locations/dashboard/analytics/page.tsx");
const demand = read("lib/marketing/location-demand-insights.ts");
const roi = read("lib/analytics/location-roi.ts");

for (const value of ["getLocationEssentialsRoi", "getLocationSearchV2DemandInsights", "location_daily_analytics", "searchCtrPercent", "bookingCompletionPercent", "signals"]) {
  requireText(intelligence, value, `Growth Intelligence missing ${value}.`);
}
requireText(intelligence, "demand.demandGaps", "Growth Intelligence must surface unmet Search V2 demand.");
requireText(intelligence, "confirmedRoiPercent", "Growth Intelligence must preserve confirmed ROI.");
requireText(intelligence, "reservationCompletionsPercent", "Growth Intelligence must compare booking trends.");
requireText(demand, 'search_core_version", "v2"', "Demand intelligence must stay on Search V2.");
requireText(roi, "marketing_attribution_events", "Growth Intelligence must use canonical attribution.");

for (const value of ["Growth Intelligence", "Executive signals", "Live Search V2 demand", "Discovery → action", "ROI & Attribution", "Revenue confidence"]) {
  requireText(analyticsPage, value, `Business analytics page missing ${value}.`);
}
requireText(analyticsPage, "Marketing Studio", "Growth Intelligence must connect insights to action.");
requireText(analyticsPage, "Visibility Health", "Growth Intelligence must connect visibility insights to action.");

console.log("Growth Intelligence Dashboard regression checks passed.");
