import { canonicalTaxonomy, findTaxonomyMatches } from "@/lib/search/v2/taxonomy";
import { evidence } from "./profileEvidence";
import { profileHash } from "./profileHash";
import { sanitizeClassificationValues } from "./profileClassificationSanitizer";
import { SEARCH_PROFILE_VERSION, type LocationProfileSource, type LocationSearchProfile, type ManualProfileOverrides, type ProfileFacet, type SearchDomain } from "./profileTypes";
import { validateLocationSearchProfile } from "./validateLocationSearchProfile";

const sorted = (values: Iterable<string>) => [...new Set(values)].filter(Boolean).sort();
const normalize = (value: string | null | undefined) => (value ?? "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
const NIGHTLIFE_ORIENTED = /(^|[\s_-])(bar|cocktail bar|sports bar|pub|lounge|speakeasy|nightlife|nightclub|night club|rooftop bar|rooftop lounge|wine bar|beer garden)([\s_-]|$)/i;
const HOOKAH_IDENTITY = /(^|[\s_-])(hookah|hookah lounge|hookah bar|hookah restaurant|hookah cafe|shisha|shisha lounge)([\s_-]|$)/i;
const UNSUPPORTED_NON_OUTING = /(perfume|perfumery|fragrance|wholesale|wholesaler|portfolio prep|not open to the public|beauty wholesale|general store|retail store|department store)/i;

function sanitizedSource(source: LocationProfileSource) {
  return {
    categories: sanitizeClassificationValues(source.categories ?? [], { allowGeneric: true }),
    cuisines: sanitizeClassificationValues(source.cuisines ?? [], { allowGeneric: true }),
    foodTerms: sanitizeClassificationValues(source.foodTerms ?? [], { allowGeneric: true }),
    features: sanitizeClassificationValues(source.features ?? []),
  };
}

const sourceText = (source: LocationProfileSource) => {
  const clean = sanitizedSource(source);
  return [source.name, source.restaurantName, source.activityName, source.locationType, source.activityType, source.primaryCategory, ...clean.categories, ...clean.cuisines, ...clean.foodTerms, ...clean.features, source.description].filter(Boolean).join(" ").toLowerCase();
};

function exactAuthoritativeEntries(source: LocationProfileSource) {
  const clean = sanitizedSource(source);
  const values = sorted([normalize(source.locationType), normalize(source.activityType), normalize(source.primaryCategory), ...clean.categories.map(normalize), ...clean.cuisines.map(normalize), ...clean.foodTerms.map(normalize)]);
  return canonicalTaxonomy.filter((entry) => values.some((value) => value === entry.id || entry.aliases.includes(value) || entry.retrievalTerms.includes(value)));
}

export function buildLocationSearchProfile(source: LocationProfileSource, overrides: ManualProfileOverrides = {}, generatedAt = new Date().toISOString()): LocationSearchProfile {
  const clean = sanitizedSource(source);
  const allMatches = findTaxonomyMatches(sourceText(source));
  const authoritativeEntries = exactAuthoritativeEntries(source);
  const locationType = normalize(source.locationType);
  const primaryCategory = normalize(source.primaryCategory);
  const categoryIdentity = [locationType, primaryCategory, normalize(source.activityType), ...clean.categories.map(normalize)].join(" ");
  const explicitRestaurant = locationType.includes("restaurant") || Boolean(source.restaurantName);
  const explicitNightlifeIdentity = NIGHTLIFE_ORIENTED.test(categoryIdentity) || locationType.includes("night");
  const explicitHookahIdentity = HOOKAH_IDENTITY.test(categoryIdentity) || HOOKAH_IDENTITY.test(sourceText(source));
  const unsupported = !explicitRestaurant && UNSUPPORTED_NON_OUTING.test([source.name, source.primaryCategory, source.activityType, source.description].filter(Boolean).join(" "));

  const matches = allMatches.filter((entry) => {
    if (entry.domain !== "nightlife") return true;
    if (entry.id === "bar" && explicitRestaurant && !explicitNightlifeIdentity) return false;
    return explicitNightlifeIdentity || !explicitRestaurant;
  });

  const mergedEntries = [...new Map([...matches, ...authoritativeEntries].map((entry) => [`${entry.domain}:${entry.id}`, entry])).values()];
  const byFacet = (facet: string) => sorted(mergedEntries.filter((entry) => entry.domain === facet).map((entry) => entry.id));
  const inferredDomains = sorted(mergedEntries.map((entry) => entry.domain).filter((domain): domain is SearchDomain => domain === "restaurant" || domain === "activity" || domain === "nightlife"));
  const explicitActivityIdentity = Boolean(source.activityName || source.activityType || locationType.includes("activity"));
  const primaryDomain: SearchDomain = overrides.primaryDomain ?? (explicitRestaurant ? "restaurant" : explicitHookahIdentity ? "activity" : explicitNightlifeIdentity ? "nightlife" : explicitActivityIdentity ? "activity" : (inferredDomains[0] as SearchDomain | undefined) ?? "activity");

  const cuisineIds = byFacet("cuisine");
  const restaurantCategoryIds = sorted([
    ...(explicitRestaurant ? ["restaurant"] : []),
    ...byFacet("restaurant_category"),
    ...cuisineIds,
  ]);
  const activityCategories = byFacet("activity");
  const nightlifeCategories = explicitRestaurant && !explicitNightlifeIdentity ? [] : byFacet("nightlife");
  const filteredEntries = mergedEntries.filter((entry) => !(entry.domain === "nightlife" && explicitRestaurant && !explicitNightlifeIdentity));
  const evidenceItems = filteredEntries.map((entry) => evidence("categories", "canonical_taxonomy", entry.id, authoritativeEntries.some((candidate) => candidate.id === entry.id && candidate.domain === entry.domain) ? "authoritative" : "supporting"));

  const base: Omit<LocationSearchProfile, "profileHash" | "generatedAt"> = {
    locationId: source.id,
    primaryDomain,
    supportedDomains: sorted([
      primaryDomain,
      ...(primaryDomain !== "restaurant" ? inferredDomains : []),
      ...(activityCategories.length ? ["activity" as const] : []),
      ...(nightlifeCategories.length ? ["nightlife" as const, "activity" as const] : []),
    ]) as SearchDomain[],
    restaurantCategories: restaurantCategoryIds,
    cuisines: cuisineIds,
    foods: byFacet("food"),
    activityCategories,
    nightlifeCategories,
    mealPeriods: byFacet("meal_period"),
    features: sorted([...byFacet("feature"), ...(explicitRestaurant && allMatches.some((entry) => entry.id === "bar") && !explicitNightlifeIdentity ? ["cocktails"] : [])]),
    audiences: byFacet("audience"),
    occasions: byFacet("occasion"),
    vibes: byFacet("vibe"),
    canonicalTerms: sorted(filteredEntries.flatMap((entry) => [entry.id, ...entry.retrievalTerms])),
    exclusions: sorted([...(overrides.exclusions ?? []), ...(unsupported ? ["unsupported_non_outing"] : [])]),
    searchText: "",
    latitude: source.latitude ?? null,
    longitude: source.longitude ?? null,
    market: source.market ?? null,
    city: source.city ?? null,
    neighborhood: source.neighborhood ?? null,
    borough: source.borough ?? null,
    county: source.county ?? null,
    state: source.state ?? null,
    classificationSources: Object.fromEntries(filteredEntries.map((entry) => [entry.id, authoritativeEntries.some((candidate) => candidate.id === entry.id && candidate.domain === entry.domain) ? ["authoritative_location_fields"] : ["canonical_taxonomy"]])),
    evidence: evidenceItems,
    manualOverrides: overrides,
    confidence: 0,
    needsReview: false,
    reviewReasons: [],
    profileVersion: SEARCH_PROFILE_VERSION,
  };

  for (const facet of Object.keys(overrides.add ?? {}) as ProfileFacet[]) base[facet] = sorted([...(base[facet] as string[]), ...(overrides.add?.[facet] ?? [])]) as never;
  for (const facet of Object.keys(overrides.remove ?? {}) as ProfileFacet[]) base[facet] = (base[facet] as string[]).filter((value) => !(overrides.remove?.[facet] ?? []).includes(value)) as never;

  base.searchText = sorted([source.id, source.name, source.restaurantName ?? "", source.activityName ?? "", source.activityType ?? "", source.primaryCategory ?? "", source.address ?? "", source.market ?? "", source.city ?? "", source.neighborhood ?? "", source.borough ?? "", source.county ?? "", source.state ?? "", ...base.canonicalTerms]).join(" ");
  const evidenceScore = base.evidence.reduce((sum, item) => sum + (item.strength === "authoritative" ? 1 : item.strength === "strong" ? 0.75 : 0.25), 0);
  base.confidence = Math.min(1, Math.round((0.35 + evidenceScore / Math.max(4, base.evidence.length)) * 100) / 100);
  const withTemporaryHash: LocationSearchProfile = { ...base, profileHash: "", generatedAt };
  const validation = validateLocationSearchProfile(withTemporaryHash, source, false);
  base.reviewReasons = sorted([...(validation.reasons ?? []), ...(unsupported ? ["unsupported_non_outing"] : [])]);
  base.needsReview = unsupported || !validation.valid;
  base.confidence = unsupported ? Math.min(validation.confidence, 0.2) : validation.confidence;
  return { ...base, profileHash: profileHash(base), generatedAt };
}

export function getCanonicalTaxonomyVersion(): number {
  return canonicalTaxonomy.length ? SEARCH_PROFILE_VERSION : 0;
}
