import type { EnterpriseLocation, SearchDomain, SearchIntent } from "./types";

export type CanonicalSearchType =
  | "restaurant"
  | "activity"
  | "hybrid"
  | "nightlife"
  | "unsupported";

export type ClassificationResult = {
  canonicalType: CanonicalSearchType;
  restaurantConfidence: number;
  activityConfidence: number;
  evidence: string[];
  conflicts: string[];
};

export type CandidateEligibilityResult = {
  eligible: boolean;
  hardRejectReasons: string[];
  warnings: string[];
  detectedDomain: "restaurant" | "activity" | "hybrid" | "unsupported";
  classificationConfidence: number;
};

function textFrom(record: EnterpriseLocation, fields: string[]) {
  return fields
    .map((field) => {
      const value = (record as any)[field];
      return Array.isArray(value) ? value.join(" ") : String(value ?? "");
    })
    .join(" ")
    .toLowerCase()
    .replace(/[\s_-]+/g, " ")
    .trim();
}

const SUPPORTED_TYPES = new Set(["restaurant", "activity", "hybrid", "nightlife", "unsupported"]);
const RESTAURANT_RE = /\b(restaurant|restaurants|dining|eatery|bistro|brasserie|steakhouse|seafood|sushi|pizzeria|pizza|taqueria|tacos|mexican|italian|chinese|thai|indian|korean|japanese|caribbean|cuisine|food|grill|bar and grill|gastropub|cafe|bakery|brunch|lunch|dinner|coffee|dessert)\b/;
const ACTIVITY_RE = /\b(activity|activities|experience|entertainment|karaoke|bowling|arcade|escape room|mini golf|museum|gallery|theater|theatre|cinema|movie theater|park|garden|zoo|aquarium|spa|wellness|concert|venue|comedy)\b/;
const NIGHTLIFE_RE = /\b(nightlife|night club|nightclub|dance club|club|lounge|hookah|cigar|bar|cocktail|rooftop|speakeasy)\b/;

function normalizeType(value: unknown): CanonicalSearchType | null {
  const normalized = String(value ?? "").toLowerCase().trim().replace(/[\s-]+/g, "_");
  if (!normalized) return null;
  if (normalized === "restaurants" || normalized === "dining") return "restaurant";
  if (normalized === "activities" || normalized === "experience") return "activity";
  if (normalized === "bar" || normalized === "club") return "nightlife";
  return SUPPORTED_TYPES.has(normalized) ? (normalized as CanonicalSearchType) : null;
}

export function classifySearchLocation(location: EnterpriseLocation): ClassificationResult {
  const evidence: string[] = [];
  const conflicts: string[] = [];
  const adminType = normalizeType((location as any).canonical_search_type ?? (location as any).admin_canonical_search_type);
  if (adminType) {
    evidence.push("admin_canonical_search_type");
    return {
      canonicalType: adminType,
      restaurantConfidence: adminType === "restaurant" || adminType === "hybrid" ? 1 : 0,
      activityConfidence: adminType === "activity" || adminType === "hybrid" ? 1 : 0,
      evidence,
      conflicts,
    };
  }

  const explicit = normalizeType(location.location_type);
  const sourceType = normalizeType((location as any).source_entity_type ?? (location as any).source_table ?? (location as any).type);
  let restaurantScore = 0;
  let activityScore = 0;
  let nightlifeScore = 0;

  if (explicit) {
    evidence.push(`location_type:${explicit}`);
    if (explicit === "restaurant") restaurantScore += 0.9;
    if (explicit === "activity") activityScore += 0.9;
    if (explicit === "hybrid") { restaurantScore += 0.8; activityScore += 0.8; }
    if (explicit === "nightlife") nightlifeScore += 0.85;
    if (explicit === "unsupported") return { canonicalType: "unsupported", restaurantConfidence: 0, activityConfidence: 0, evidence, conflicts };
  }
  if (sourceType) {
    evidence.push(`source_type:${sourceType}`);
    if (sourceType === "restaurant") restaurantScore += 0.25;
    if (sourceType === "activity") activityScore += 0.25;
  }
  if (location.restaurant_name || location.cuisine || location.cuisine_type) { restaurantScore += 0.45; evidence.push("structured_restaurant_fields"); }
  if (location.activity_name || location.activity_type) { activityScore += 0.45; evidence.push("structured_activity_fields"); }

  const taxonomy = textFrom(location, ["primary_category", "category", "google_types"]);
  if (RESTAURANT_RE.test(taxonomy)) { restaurantScore += 0.25; evidence.push("taxonomy_restaurant"); }
  if (ACTIVITY_RE.test(taxonomy)) { activityScore += 0.25; evidence.push("taxonomy_activity"); }
  if (NIGHTLIFE_RE.test(taxonomy)) { nightlifeScore += 0.25; evidence.push("taxonomy_nightlife"); }

  const softText = textFrom(location, ["tags", "vibe_tags", "best_for_tags", "date_style_tags", "search_keywords", "semantic_tags", "intent_tags", "description", "search_document", "semantic_search_text"]);
  if (RESTAURANT_RE.test(softText)) restaurantScore += 0.12;
  if (ACTIVITY_RE.test(softText)) activityScore += 0.12;
  if (NIGHTLIFE_RE.test(softText)) nightlifeScore += 0.12;

  if (restaurantScore >= 0.7 && activityScore >= 0.7) conflicts.push("strong_restaurant_and_activity_signals");
  if (explicit === "restaurant" && activityScore >= 0.7) conflicts.push("explicit_restaurant_with_activity_signals");
  if (explicit === "activity" && restaurantScore >= 0.7) conflicts.push("explicit_activity_with_restaurant_signals");

  if (restaurantScore >= 0.7 && activityScore >= 0.7) return { canonicalType: "hybrid", restaurantConfidence: Math.min(1, restaurantScore), activityConfidence: Math.min(1, activityScore), evidence, conflicts };
  if (restaurantScore >= 0.55) return { canonicalType: "restaurant", restaurantConfidence: Math.min(1, restaurantScore), activityConfidence: Math.min(1, activityScore), evidence, conflicts };
  if (activityScore >= 0.55) return { canonicalType: "activity", restaurantConfidence: Math.min(1, restaurantScore), activityConfidence: Math.min(1, activityScore), evidence, conflicts };
  if (nightlifeScore >= 0.55) return { canonicalType: "nightlife", restaurantConfidence: Math.min(1, restaurantScore), activityConfidence: Math.min(1, activityScore), evidence, conflicts };
  return { canonicalType: "unsupported", restaurantConfidence: Math.min(1, restaurantScore), activityConfidence: Math.min(1, activityScore), evidence, conflicts };
}

function publishabilityRejects(location: EnterpriseLocation) {
  const reasons: string[] = [];
  if (location.deleted_at) reasons.push("deleted");
  if (location.is_hidden === true) reasons.push("hidden");
  if (location.active === false || location.is_searchable === false) reasons.push("not_searchable");
  if (["closed", "archived", "hidden", "deleted", "permanently_closed"].includes(String(location.status ?? "").toLowerCase())) reasons.push("unavailable");
  if (String(location.duplicate_status ?? "").toLowerCase() === "duplicate" || (location as any).duplicate_of) reasons.push("duplicate");
  return reasons;
}

export function evaluateCandidateEligibility({ location, expectedDomain }: { location: EnterpriseLocation; intent?: SearchIntent; expectedDomain: Exclude<SearchDomain, "mixed" | "any">; resolvedMarket?: string | null; searchTime?: Date | string | null; lane?: string; }): CandidateEligibilityResult {
  const classification = classifySearchLocation(location);
  const hardRejectReasons = publishabilityRejects(location);
  const warnings = [...classification.conflicts];
  const allowed = expectedDomain === "restaurant"
    ? classification.canonicalType === "restaurant" || classification.canonicalType === "hybrid"
    : classification.canonicalType === "activity" || classification.canonicalType === "hybrid";
  if (classification.canonicalType === "unsupported" || classification.canonicalType === "nightlife") hardRejectReasons.push("unsupported_location_type");
  if (!allowed) hardRejectReasons.push("wrong_domain");
  return {
    eligible: hardRejectReasons.length === 0,
    hardRejectReasons: Array.from(new Set(hardRejectReasons)),
    warnings,
    detectedDomain: classification.canonicalType === "nightlife" ? "unsupported" : classification.canonicalType,
    classificationConfidence: expectedDomain === "restaurant" ? classification.restaurantConfidence : classification.activityConfidence,
  };
}
