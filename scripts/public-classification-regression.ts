import { classifyPublicLocation, getPublicLocationLabels } from "../lib/public-classification";
import { getScoreConfidence, getPublicTrustBadges } from "../lib/public-trust";

function assert(condition: unknown, message: string) { if (!condition) throw new Error(message); }
const cases = [
  [{ location_type: "restaurant", cuisine: "French", primary_category: "French", is_searchable: true, quality_status: "publish_ready" }, "restaurant", "French"],
  [{ primary_category: "point_of_interest", google_types: ["doctor"], is_searchable: true }, "other", "excluded"],
  [{ activity_type: "Bowling", tags: ["games", "Games"], is_searchable: true }, "activity", "Bowling"],
  [{ primary_category: "hookah lounge", is_searchable: true }, "nightlife", "Hookah Lounge"],
  [{ primary_category: "museum", google_types: ["museum", "establishment"], is_searchable: true }, "activity", "Museum"],
] as const;
for (const [input, domain, label] of cases) {
  const result = classifyPublicLocation(input);
  assert(result.domain === domain, `expected ${domain} for ${JSON.stringify(input)}, got ${result.domain}`);
  if (label === "excluded") assert(Boolean(result.exclusionReason), "expected exclusion reason");
  else assert(result.primaryLabel === label, `expected label ${label}, got ${result.primaryLabel}`);
}
const labels = getPublicLocationLabels({ primary_category: "Creative", tags: ["Creative", "Games", "games", "Unknown"] });
assert(labels.primaryLabel === "Creative", "keeps primary label");
assert(labels.secondaryLabels.join("|") === "Games", "dedupes generic/duplicate labels");
assert(getScoreConfidence({ theouthaven_score: 99, rating: 4.8, review_count: 500 }).publicScore === null, "hides placeholder scores");
assert(getScoreConfidence({ theouthaven_score: 87, rating: 4.7, review_count: 80, saves_count: 10 }).confidence === "verified", "verified scores need signals");
assert(getPublicTrustBadges({ rating: 4.8, review_count: 120, reservation_count: 1 }).length === 2, "creates truthful badges");
console.log(JSON.stringify({ ok: true, cases: cases.length }));
