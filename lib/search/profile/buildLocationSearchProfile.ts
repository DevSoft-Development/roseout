import { canonicalTaxonomy, findTaxonomyMatches } from "@/lib/search/v2/taxonomy";
import { evidence } from "./profileEvidence";
import { profileHash } from "./profileHash";
import { SEARCH_PROFILE_VERSION, type LocationProfileSource, type LocationSearchProfile, type ManualProfileOverrides, type ProfileFacet, type SearchDomain } from "./profileTypes";
import { validateLocationSearchProfile } from "./validateLocationSearchProfile";

const sorted = (values: Iterable<string>) => [...new Set(values)].filter(Boolean).sort();
const text = (source: LocationProfileSource) => [source.name, source.restaurantName, source.activityName, source.locationType, source.primaryCategory, ...(source.categories ?? []), ...(source.cuisines ?? []), ...(source.foodTerms ?? []), ...(source.features ?? []), source.description].filter(Boolean).join(" ").toLowerCase();

export function buildLocationSearchProfile(source: LocationProfileSource, overrides: ManualProfileOverrides = {}, generatedAt = new Date().toISOString()): LocationSearchProfile {
  const matches = findTaxonomyMatches(text(source));
  const byFacet = (facet: string) => sorted(matches.filter((entry) => entry.domain === facet).map((entry) => entry.id));
  const inferredDomains = sorted(matches.map((entry) => entry.domain).filter((domain): domain is SearchDomain => domain === "restaurant" || domain === "activity" || domain === "nightlife"));
  const locationType = (source.locationType ?? "").toLowerCase();
  const primaryDomain: SearchDomain = overrides.primaryDomain ?? (locationType.includes("restaurant") ? "restaurant" : locationType.includes("night") || locationType.includes("bar") ? "nightlife" : (inferredDomains[0] as SearchDomain | undefined) ?? "activity");
  const base: Omit<LocationSearchProfile, "profileHash" | "generatedAt"> = {
    locationId: source.id,
    primaryDomain,
    supportedDomains: sorted([primaryDomain, ...inferredDomains]) as SearchDomain[],
    restaurantCategories: byFacet("restaurant_category"), cuisines: sorted([...(source.cuisines ?? []), ...byFacet("cuisine")]), foods: sorted([...(source.foodTerms ?? []), ...byFacet("food")]),
    activityCategories: byFacet("activity"), nightlifeCategories: byFacet("nightlife"), mealPeriods: byFacet("meal_period"), features: sorted([...(source.features ?? []), ...byFacet("feature")]),
    audiences: byFacet("audience"), occasions: byFacet("occasion"), vibes: byFacet("vibe"), canonicalTerms: sorted(matches.flatMap((entry) => [entry.id, ...entry.retrievalTerms])),
    exclusions: sorted(overrides.exclusions ?? []), searchText: "", latitude: source.latitude ?? null, longitude: source.longitude ?? null, market: source.market ?? null, city: source.city ?? null, neighborhood: source.neighborhood ?? null, borough: source.borough ?? null, county: source.county ?? null, state: source.state ?? null,
    classificationSources: Object.fromEntries(matches.map((entry) => [entry.id, ["canonical_taxonomy"]])),
    evidence: matches.map((entry) => evidence("categories", "canonical_taxonomy", entry.id, (source.categories ?? []).some((value) => entry.aliases.includes(value.toLowerCase())) ? "strong" : "supporting")),
    manualOverrides: overrides, confidence: 0, needsReview: false, reviewReasons: [], profileVersion: SEARCH_PROFILE_VERSION,
  };
  for (const facet of Object.keys(overrides.add ?? {}) as ProfileFacet[]) base[facet] = sorted([...(base[facet] as string[]), ...(overrides.add?.[facet] ?? [])]) as never;
  for (const facet of Object.keys(overrides.remove ?? {}) as ProfileFacet[]) base[facet] = (base[facet] as string[]).filter((value) => !(overrides.remove?.[facet] ?? []).includes(value)) as never;
  base.searchText = sorted([source.id, source.name, source.restaurantName ?? "", source.activityName ?? "", source.address ?? "", source.market ?? "", source.city ?? "", source.neighborhood ?? "", source.borough ?? "", source.county ?? "", source.state ?? "", ...base.canonicalTerms]).join(" ");
  const evidenceScore = base.evidence.reduce((sum, item) => sum + (item.strength === "authoritative" ? 1 : item.strength === "strong" ? 0.75 : 0.25), 0);
  base.confidence = Math.min(1, Math.round((0.35 + evidenceScore / Math.max(4, base.evidence.length)) * 100) / 100);
  const withTemporaryHash: LocationSearchProfile = { ...base, profileHash: "", generatedAt };
  const validation = validateLocationSearchProfile(withTemporaryHash, source, false);
  base.reviewReasons = validation.reasons;
  base.needsReview = !validation.valid;
  base.confidence = validation.confidence;
  return { ...base, profileHash: profileHash(base), generatedAt };
}

export function getCanonicalTaxonomyVersion(): number { return canonicalTaxonomy.length ? SEARCH_PROFILE_VERSION : 0; }
