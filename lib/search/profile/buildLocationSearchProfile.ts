import { canonicalTaxonomy, findTaxonomyMatches } from "@/lib/search/v2/taxonomy";
import { evidence } from "./profileEvidence";
import { profileHash } from "./profileHash";
import { sanitizeClassificationValues } from "./profileClassificationSanitizer";
import { SEARCH_PROFILE_VERSION, type LocationProfileSource, type LocationSearchProfile, type ManualProfileOverrides, type ProfileFacet, type SearchDomain } from "./profileTypes";
import { validateLocationSearchProfile } from "./validateLocationSearchProfile";

const sorted = (values: Iterable<string>) => [...new Set(values)].filter(Boolean).sort();
const normalize = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

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
  return [
    source.name,
    source.restaurantName,
    source.activityName,
    source.locationType,
    source.activityType,
    source.primaryCategory,
    ...clean.categories,
    ...clean.cuisines,
    ...clean.foodTerms,
    ...clean.features,
    source.description,
  ].filter(Boolean).join(" ").toLowerCase();
};

export function buildLocationSearchProfile(source: LocationProfileSource, overrides: ManualProfileOverrides = {}, generatedAt = new Date().toISOString()): LocationSearchProfile {
  const clean = sanitizedSource(source);
  const matches = findTaxonomyMatches(sourceText(source));
  const byFacet = (facet: string) => sorted(matches.filter((entry) => entry.domain === facet).map((entry) => entry.id));
  const inferredDomains = sorted(matches.map((entry) => entry.domain).filter((domain): domain is SearchDomain => domain === "restaurant" || domain === "activity" || domain === "nightlife"));
  const locationType = normalize(source.locationType);
  const authoritativeActivityValues = sorted([
    normalize(source.activityType),
    normalize(source.primaryCategory),
    ...clean.categories.map(normalize),
  ]);
  const authoritativeEntries = canonicalTaxonomy.filter((entry) =>
    (entry.domain === "activity" || entry.domain === "nightlife")
    && authoritativeActivityValues.some((value) => value === entry.id || entry.aliases.includes(value) || entry.retrievalTerms.includes(value)),
  );
  const authoritativeActivityEntries = authoritativeEntries.filter((entry) => entry.domain === "activity");
  const authoritativeNightlifeEntries = authoritativeEntries.filter((entry) => entry.domain === "nightlife");
  const authoritativeActivityMatches = authoritativeActivityEntries.map((entry) => entry.id);
  const authoritativeNightlifeMatches = authoritativeNightlifeEntries.map((entry) => entry.id);
  const explicitActivityIdentity = Boolean(source.activityName || source.activityType || locationType.includes("activity"));
  const explicitNightlifeIdentity = locationType.includes("night") || locationType.includes("bar") || authoritativeNightlifeMatches.length > 0;
  const primaryDomain: SearchDomain = overrides.primaryDomain
    ?? (locationType.includes("restaurant") ? "restaurant" : explicitNightlifeIdentity ? "nightlife" : explicitActivityIdentity || authoritativeActivityMatches.length ? "activity" : (inferredDomains[0] as SearchDomain | undefined) ?? "activity");
  const activityCategories = sorted([...authoritativeActivityMatches, ...byFacet("activity")]);
  const nightlifeCategories = sorted([...authoritativeNightlifeMatches, ...byFacet("nightlife")]);
  const matchedEntries = [...new Map([...matches, ...authoritativeEntries].map((entry) => [entry.id, entry])).values()];
  const evidenceItems = matchedEntries.map((entry) => evidence(
    "categories",
    "canonical_taxonomy",
    entry.id,
    authoritativeActivityValues.some((value) => value === entry.id || entry.aliases.includes(value) || entry.retrievalTerms.includes(value)) ? "authoritative" : "supporting",
  ));

  const base: Omit<LocationSearchProfile, "profileHash" | "generatedAt"> = {
    locationId: source.id,
    primaryDomain,
    supportedDomains: sorted([primaryDomain, ...inferredDomains, ...(activityCategories.length ? ["activity" as const] : []), ...(nightlifeCategories.length ? ["nightlife" as const] : [])]) as SearchDomain[],
    restaurantCategories: byFacet("restaurant_category"),
    cuisines: byFacet("cuisine"),
    foods: byFacet("food"),
    activityCategories,
    nightlifeCategories,
    mealPeriods: byFacet("meal_period"),
    features: byFacet("feature"),
    audiences: byFacet("audience"),
    occasions: byFacet("occasion"),
    vibes: byFacet("vibe"),
    canonicalTerms: sorted(matchedEntries.flatMap((entry) => [entry.id, ...entry.retrievalTerms])),
    exclusions: sorted(overrides.exclusions ?? []),
    searchText: "",
    latitude: source.latitude ?? null,
    longitude: source.longitude ?? null,
    market: source.market ?? null,
    city: source.city ?? null,
    neighborhood: source.neighborhood ?? null,
    borough: source.borough ?? null,
    county: source.county ?? null,
    state: source.state ?? null,
    classificationSources: Object.fromEntries(matchedEntries.map((entry) => [entry.id, authoritativeActivityValues.some((value) => value === entry.id || entry.aliases.includes(value) || entry.retrievalTerms.includes(value)) ? ["authoritative_location_fields"] : ["canonical_taxonomy"]])),
    evidence: evidenceItems,
    manualOverrides: overrides,
    confidence: 0,
    needsReview: false,
    reviewReasons: [],
    profileVersion: SEARCH_PROFILE_VERSION,
  };

  for (const facet of Object.keys(overrides.add ?? {}) as ProfileFacet[]) base[facet] = sorted([...(base[facet] as string[]), ...(overrides.add?.[facet] ?? [])]) as never;
  for (const facet of Object.keys(overrides.remove ?? {}) as ProfileFacet[]) base[facet] = (base[facet] as string[]).filter((value) => !(overrides.remove?.[facet] ?? []).includes(value)) as never;

  base.searchText = sorted([
    source.id,
    source.name,
    source.restaurantName ?? "",
    source.activityName ?? "",
    source.activityType ?? "",
    source.primaryCategory ?? "",
    source.address ?? "",
    source.market ?? "",
    source.city ?? "",
    source.neighborhood ?? "",
    source.borough ?? "",
    source.county ?? "",
    source.state ?? "",
    ...base.canonicalTerms,
  ]).join(" ");

  const evidenceScore = base.evidence.reduce((sum, item) => sum + (item.strength === "authoritative" ? 1 : item.strength === "strong" ? 0.75 : 0.25), 0);
  base.confidence = Math.min(1, Math.round((0.35 + evidenceScore / Math.max(4, base.evidence.length)) * 100) / 100);
  const withTemporaryHash: LocationSearchProfile = { ...base, profileHash: "", generatedAt };
  const validation = validateLocationSearchProfile(withTemporaryHash, source, false);
  base.reviewReasons = validation.reasons;
  base.needsReview = !validation.valid;
  base.confidence = validation.confidence;
  return { ...base, profileHash: profileHash(base), generatedAt };
}

export function getCanonicalTaxonomyVersion(): number {
  return canonicalTaxonomy.length ? SEARCH_PROFILE_VERSION : 0;
}
