import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
}
function requireText(source, text, message) {
  if (!source.includes(text)) throw new Error(message);
}

const migration = read("supabase/migrations/20260923013000_canonical_attribution_spine.sql");
const canonical = read("lib/marketing/canonical-attribution.ts");
const roi = read("lib/analytics/location-roi.ts");
const analyticsPage = read("apps/business/app/locations/dashboard/analytics/page.tsx");
const reservation = read("lib/reservation.ts");
const tracking = read("lib/analytics/trackClientEvent.ts");
const reserveRoot = read("app/api/reserve/location/route.ts");
const reserveIsolated = read("apps/reserve/app/api/reserve/location/route.ts");
const reserveEntry = read("apps/reserve/app/reserve/location/[locationId]/page.tsx");
const reserveBooking = read("apps/reserve/app/reserve/location/[locationId]/booking/page.tsx");
const planRoot = read("app/plan/page.tsx");
const planConsumer = read("apps/consumer/app/plan/page.tsx");
const guidedRoot = read("app/plan/GuidedCompleteOuting.tsx");
const guidedConsumer = read("apps/consumer/app/plan/GuidedCompleteOuting.tsx");
const cronRoot = read("app/api/cron/marketing-attribution/route.ts");
const cronConsumer = read("apps/consumer/app/api/cron/marketing-attribution/route.ts");

requireText(migration, "marketing_attribution_dedupe_key_idx", "Canonical attribution must be idempotent.");
requireText(migration, "revenue_kind", "Canonical attribution must distinguish revenue confidence.");
requireText(migration, "attribution_promotion_campaign_id", "Reserve must persist sponsored campaign identity.");
requireText(migration, "attribution_search_id", "Reserve must persist search identity.");
requireText(migration, "marketing_attribution_revenue_idx", "Revenue queries need a covering index.");

for (const source of [reserveRoot, reserveIsolated]) {
  requireText(source, "reservationAttribution(body.attribution)", "Reserve APIs must parse canonical attribution.");
  requireText(source, "attribution_search_id", "Reserve APIs must store search attribution.");
  requireText(source, "attribution_promotion_campaign_id", "Reserve APIs must store sponsored attribution.");
  requireText(source, "attribution_channel_class", "Reserve APIs must store organic/sponsored/owned classification.");
}
if (reserveRoot !== reserveIsolated) throw new Error("Root and isolated Reserve booking routes must remain identical.");

requireText(tracking, "getActiveAttributionContext", "Consumer analytics must expose active attribution context.");
requireText(tracking, "activePromotionContext()", "Active sponsored touch must feed reservation attribution.");
requireText(reservation, "toh_search_id", "Reserve URL must carry search identity across subdomains.");
requireText(reservation, "toh_promotion_campaign_id", "Reserve URL must carry sponsored campaign across subdomains.");
requireText(reserveEntry, "toh_search_id", "Reserve time selection must preserve attribution.");
requireText(reserveBooking, "attribution,", "Reserve booking submission must send attribution.");

for (const source of [planRoot, guidedRoot]) {
  requireText(source, "getActiveAttributionContext", "Plan Reserve links must capture active attribution.");
}
if (planRoot !== planConsumer) throw new Error("Root and consumer plan pages must remain identical.");
if (guidedRoot !== guidedConsumer) throw new Error("Root and consumer guided completion pages must remain identical.");

for (const value of ["analyticsRows", "promotionRows", "reservationRows", "visitRows", "experienceRows", "ticketRows"]) {
  requireText(canonical, value, `Canonical materializer missing ${value}.`);
}
requireText(canonical, '"confirmed"', "Canonical materializer must support confirmed revenue.");
requireText(canonical, '"estimated"', "Canonical materializer must support estimated revenue.");
requireText(canonical, "onConflict: \"dedupe_key\"", "Canonical materializer must bulk-upsert idempotently.");

requireText(roi, "confirmedRevenueCents", "ROI must expose confirmed revenue.");
requireText(roi, "estimatedRevenueCents", "ROI must expose estimated revenue separately.");
requireText(roi, "promotion_ledger_entries", "ROI must use actual promotion spend ledger.");
requireText(roi, "confirmedConversionIds", "ROI must avoid double-counting estimated and confirmed revenue.");
requireText(analyticsPage, "ROI & Attribution", "Business Analytics must expose the Essentials+ ROI workspace.");
requireText(analyticsPage, "Revenue confidence", "ROI UI must explain confirmed vs estimated revenue.");

requireText(cronRoot, "syncCanonicalAttribution", "Existing attribution cron must run canonical attribution.");
if (cronRoot !== cronConsumer) throw new Error("Root and consumer attribution cron routes must remain identical.");

console.log("Canonical attribution + Essentials+ ROI regression checks passed.");
