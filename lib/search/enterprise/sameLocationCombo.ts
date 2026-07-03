import type { EnterpriseLocation, SearchIntent } from "./types";
import { isSportsWatchComboEligible } from "./ranking";

function stableLocationKey(item: EnterpriseLocation) {
  const id = String((item as any).id ?? (item as any).location_id ?? "").trim();
  if (id) return `id:${id}`;

  const name = String(item.name ?? item.restaurant_name ?? item.activity_name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const address = String(item.address ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  return name || address ? `name_address:${name}|${address}` : null;
}

function comboCanonicalScore(item: EnterpriseLocation, intent: SearchIntent) {
  const record = item as any;
  const text = [
    record.location_type,
    record.source,
    record.source_table,
    item.restaurant_name,
    item.activity_name,
    item.name,
    record.primary_category,
    record.cuisine,
    record.cuisine_type,
    record.activity_type,
    record.description,
    record.tags,
    record.semantic_tags,
    record.intent_tags,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const eligibility = isSportsWatchComboEligible(item, intent);
  let score = 0;

  if (String(record.location_type ?? "").toLowerCase().includes("restaurant")) score += 80;
  if (String(record.source ?? record.source_table ?? "").toLowerCase().includes("restaurant")) score += 50;
  if (item.restaurant_name) score += 40;
  if (/\bsports bar\b|\bbar and grill\b|\bbar & grill\b|\bgastropub\b/.test(text)) score += 35;
  if (/\bpub\b|\btavern\b/.test(text)) score += 20;
  if (eligibility.status === "pass") score += 30;
  if (eligibility.status === "demote") score += 10;
  if (String(record.location_type ?? "").toLowerCase().includes("activity")) score -= 10;
  if (eligibility.status === "reject") score -= 100;

  return score;
}

export function buildCanonicalSameLocationComboList(
  candidateSources: EnterpriseLocation[][],
  intent: SearchIntent,
) {
  const chosen = new Map<string, EnterpriseLocation>();
  const sourceCounts = { restaurants: 0, activities: 0, matched_locations: 0, other: 0 };
  let rawCount = 0;

  candidateSources.forEach((items, sourceIndex) => {
    const source = sourceIndex === 0 ? "restaurants" : sourceIndex === 1 ? "activities" : sourceIndex === 2 ? "matched_locations" : "other";
    sourceCounts[source] += items.length;
    for (const item of items) {
      rawCount += 1;
      const record = item as any;
      const locationType = String(record.location_type ?? record.source_table ?? record.source ?? "").toLowerCase();
      const eligibility = isSportsWatchComboEligible(item, intent);
      if (locationType.includes("activity") && eligibility.status === "reject") {
        continue;
      }

      const key = stableLocationKey(item) ?? `unknown:${rawCount}`;
      const existing = chosen.get(key);
      if (!existing || comboCanonicalScore(item, intent) > comboCanonicalScore(existing, intent)) {
        chosen.set(key, item);
      }
    }
  });

  const locations = Array.from(chosen.values());
  return {
    locations,
    rawCount,
    dedupedCount: locations.length,
    duplicateLocationIdsRemoved: Math.max(0, rawCount - locations.length),
    sourceCounts,
  };
}
