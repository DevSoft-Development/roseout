import {
  appendMissingTermsToText,
  cleanTerms,
  escapeRegex,
  mergeTextArrayTerms,
  type LocationFoodTermPatch,
} from "../search/enterprise/location-food-terms";

export type GoogleLocationLike = Record<string, any> & {
  id?: string;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  address?: string | null;
  street_address?: string | null;
  city?: string | null;
  borough?: string | null;
  neighborhood?: string | null;
  state?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  lat?: number | string | null;
  lng?: number | string | null;
  phone?: string | null;
  website?: string | null;
  website_url?: string | null;
  google_place_id?: string | null;
};

export type GooglePlace = {
  id: string;
  displayName?: { text?: string; languageCode?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  primaryType?: string;
  types?: string[];
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  currentOpeningHours?: unknown;
  regularOpeningHours?: unknown;
  editorialSummary?: { text?: string; languageCode?: string };
  priceLevel?: string;
};

export type GooglePlaceMatch = {
  place: GooglePlace | null;
  confidence: number;
  status: "matched" | "needs_review" | "no_match";
  candidates: Array<{ place: GooglePlace; confidence: number }>;
  evidence: Record<string, unknown>;
};

export const GOOGLE_TEXT_SEARCH_FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.types,places.rating,places.userRatingCount,places.googleMapsUri,places.websiteUri";

export const GOOGLE_PLACE_DETAILS_FIELD_MASK =
  "id,displayName,formattedAddress,location,primaryType,types,rating,userRatingCount,googleMapsUri,websiteUri,nationalPhoneNumber,currentOpeningHours,regularOpeningHours,editorialSummary,priceLevel";

export const GOOGLE_TYPE_TO_TERMS: Record<string, Partial<LocationFoodTermPatch>> = {
  restaurant: { categoryTerms: ["restaurant"] },
  meal_takeaway: { categoryTerms: ["takeout"], featureTerms: ["takeout"] },
  meal_delivery: { categoryTerms: ["delivery"] },
  cafe: { categoryTerms: ["cafe"] },
  bakery: { categoryTerms: ["bakery"] },
  bar: { categoryTerms: ["bar"] },
  pub: { categoryTerms: ["pub"] },
  night_club: { categoryTerms: ["night club"] },
  cocktail_bar: { categoryTerms: ["cocktail bar"] },
  bar_and_grill: { categoryTerms: ["bar and grill"] },
  pizza_restaurant: { foodTerms: ["pizza"], categoryTerms: ["pizza restaurant"] },
  chicken_restaurant: { foodTerms: ["chicken"], categoryTerms: ["chicken restaurant"] },
  seafood_restaurant: { foodTerms: ["seafood"], categoryTerms: ["seafood restaurant"] },
  steak_house: { foodTerms: ["steak"], categoryTerms: ["steakhouse"] },
  sushi_restaurant: { foodTerms: ["sushi"], categoryTerms: ["sushi restaurant"] },
  ramen_restaurant: { foodTerms: ["ramen"], categoryTerms: ["ramen restaurant"] },
  dessert_restaurant: { categoryTerms: ["dessert restaurant"] },
};

const GOOGLE_CUISINE_TYPES: Record<string, string> = {
  african_restaurant: "african",
  american_restaurant: "american",
  argentinian_restaurant: "argentinian",
  brazilian_restaurant: "brazilian",
  caribbean_restaurant: "caribbean",
  chinese_restaurant: "chinese",
  colombian_restaurant: "colombian",
  cuban_restaurant: "cuban",
  dominican_restaurant: "dominican",
  ethiopian_restaurant: "ethiopian",
  filipino_restaurant: "filipino",
  french_restaurant: "french",
  german_restaurant: "german",
  greek_restaurant: "greek",
  indian_restaurant: "indian",
  indonesian_restaurant: "indonesian",
  irish_restaurant: "irish",
  italian_restaurant: "italian",
  japanese_restaurant: "japanese",
  korean_restaurant: "korean",
  lebanese_restaurant: "lebanese",
  mediterranean_restaurant: "mediterranean",
  mexican_restaurant: "mexican",
  middle_eastern_restaurant: "middle eastern",
  moroccan_restaurant: "moroccan",
  pakistani_restaurant: "pakistani",
  peruvian_restaurant: "peruvian",
  portuguese_restaurant: "portuguese",
  puerto_rican_restaurant: "puerto rican",
  spanish_restaurant: "spanish",
  thai_restaurant: "thai",
  turkish_restaurant: "turkish",
  vegan_restaurant: "vegan",
  vegetarian_restaurant: "vegetarian",
  vietnamese_restaurant: "vietnamese",
};

const COMPATIBLE_GOOGLE_TYPES = new Set([
  "restaurant",
  "meal_takeaway",
  "meal_delivery",
  "cafe",
  "bakery",
  "bar",
  "pub",
  "night_club",
  "food",
  "tourist_attraction",
  "amusement_center",
  "bowling_alley",
  "movie_theater",
  "performing_arts_theater",
  "museum",
  "art_gallery",
]);

const GOOGLE_EXPLICIT_FOOD_TERMS = [
  "pizza",
  "pasta",
  "brunch",
  "breakfast",
  "burger",
  "burgers",
  "steak",
  "sushi",
  "ramen",
  "taco",
  "tacos",
  "seafood",
  "lobster",
  "crab",
  "shrimp",
  "oyster",
  "oysters",
  "wings",
  "chicken wings",
  "fried chicken",
  "chicken",
  "coffee",
  "pastry",
  "pastries",
  "dessert",
  "desserts",
  "cake",
  "vegan",
  "vegetarian",
  "halal",
];

const GOOGLE_EXPLICIT_FEATURE_TERMS = [
  "live music",
  "hookah",
  "shisha",
  "rooftop",
  "roof top",
  "karaoke",
  "arcade",
  "pool",
  "billiards",
  "cocktails",
  "cocktail",
  "beer",
  "wine",
  "margaritas",
  "margarita",
  "mimosas",
  "mimosa",
  "happy hour",
  "coffee",
  "outdoor seating",
  "outdoor dining",
  "terrace",
  "patio",
  "waterfront",
  "fireplace",
];

function googleApiKey() {
  const key =
    process.env.GOOGLE_PLACES_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!key) throw new Error("Missing GOOGLE_PLACES_API_KEY or GOOGLE_MAPS_API_KEY");
  return key;
}

function locationName(location: GoogleLocationLike) {
  return [location.name, location.restaurant_name, location.activity_name]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .find(Boolean) || "";
}

function locationAddress(location: GoogleLocationLike) {
  return [location.address, location.street_address]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .find(Boolean) || "";
}

function toArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return value.split(/[|,]/).map((part) => part.trim());
  return [];
}

function normalizeText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokenSet(value: unknown) {
  return new Set(normalizeText(value).split(" ").filter((token) => token.length > 1));
}

function nameSimilarity(a: string, b: string) {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  return overlap / Math.max(left.size, right.size);
}

function streetParts(address: string) {
  const normalized = normalizeText(address);
  const number = normalized.match(/\b\d{1,6}\b/)?.[0] || "";
  const streetWords = normalized
    .replace(/\b\d{1,6}\b/g, " ")
    .split(" ")
    .filter((word) => word.length > 2 && !["street", "st", "avenue", "ave", "road", "rd", "boulevard", "blvd", "drive", "dr", "ny", "new", "york"].includes(word));
  return { number, streetWords };
}

function addressMatches(localAddress: string, googleAddress?: string) {
  if (!localAddress || !googleAddress) return false;
  const local = streetParts(localAddress);
  const google = streetParts(googleAddress);
  if (!local.number || local.number !== google.number) return false;
  return local.streetWords.some((word) => google.streetWords.includes(word));
}

function addressConflicts(localAddress: string, googleAddress?: string) {
  if (!localAddress || !googleAddress) return false;
  const local = streetParts(localAddress);
  const google = streetParts(googleAddress);
  return Boolean(local.number && google.number && local.number !== google.number);
}

function sameArea(local: GoogleLocationLike, googlePlace: GooglePlace) {
  const address = normalizeText(googlePlace.formattedAddress);
  return [local.city, local.borough, local.neighborhood]
    .filter(Boolean)
    .some((part) => address.includes(normalizeText(part)));
}

function radians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceMeters(local: GoogleLocationLike, googlePlace: GooglePlace) {
  const lat = Number(local.latitude ?? local.lat);
  const lng = Number(local.longitude ?? local.lng);
  const googleLat = Number(googlePlace.location?.latitude);
  const googleLng = Number(googlePlace.location?.longitude);
  if (![lat, lng, googleLat, googleLng].every(Number.isFinite)) return null;
  const earthRadius = 6371000;
  const dLat = radians(googleLat - lat);
  const dLng = radians(googleLng - lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(lat)) * Math.cos(radians(googleLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function digits(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function phoneMatches(local: GoogleLocationLike, googlePlace: GooglePlace) {
  const localPhone = digits(local.phone ?? local.phone_number ?? local.telephone);
  const googlePhone = digits(googlePlace.nationalPhoneNumber);
  return Boolean(localPhone && googlePhone && localPhone.slice(-10) === googlePhone.slice(-10));
}

function domain(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withProtocol).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function websiteMatches(local: GoogleLocationLike, googlePlace: GooglePlace) {
  const localDomain = domain(local.website ?? local.website_url ?? local.url);
  const googleDomain = domain(googlePlace.websiteUri);
  return Boolean(localDomain && googleDomain && localDomain === googleDomain);
}

function googleTypeCompatible(place: GooglePlace) {
  const types = [place.primaryType, ...(place.types || [])].filter(Boolean) as string[];
  if (!types.length) return true;
  return types.some(
    (type) =>
      COMPATIBLE_GOOGLE_TYPES.has(type) ||
      Boolean(GOOGLE_TYPE_TO_TERMS[type]) ||
      Boolean(GOOGLE_CUISINE_TYPES[type]),
  );
}

export function calculateGoogleMatchConfidence(local: GoogleLocationLike, googlePlace: GooglePlace) {
  let score = 0;
  const evidence: Record<string, unknown> = {};
  const localName = locationName(local);
  const googleName = googlePlace.displayName?.text || "";
  const similarity = nameSimilarity(localName, googleName);
  evidence.nameSimilarity = Number(similarity.toFixed(2));

  if (similarity >= 0.7 || normalizeText(localName) === normalizeText(googleName)) score += 35;
  else if (similarity >= 0.45) score += 20;
  else if (localName && googleName) score -= 30;

  const localAddress = locationAddress(local);
  if (addressMatches(localAddress, googlePlace.formattedAddress)) score += 25;
  else if (addressConflicts(localAddress, googlePlace.formattedAddress)) score -= 30;

  if (sameArea(local, googlePlace)) score += 15;

  const meters = distanceMeters(local, googlePlace);
  if (meters !== null) {
    evidence.distanceMeters = Math.round(meters);
    if (meters < 150) score += 15;
    else if (meters > 500) score -= 20;
  }

  if (phoneMatches(local, googlePlace)) score += 10;
  if (websiteMatches(local, googlePlace)) score += 10;
  if (!googleTypeCompatible(googlePlace)) score -= 20;

  return { confidence: Math.max(0, Math.min(100, score)), evidence };
}

export async function findGooglePlaceForLocation(location: GoogleLocationLike): Promise<GooglePlaceMatch> {
  const query = [
    locationName(location),
    locationAddress(location),
    location.city,
    location.state,
  ].filter(Boolean).join(" ").trim();

  if (!query) {
    return { place: null, confidence: 0, status: "no_match", candidates: [], evidence: { reason: "missing_query" } };
  }

  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": googleApiKey(),
      "X-Goog-FieldMask": GOOGLE_TEXT_SEARCH_FIELD_MASK,
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: 5 }),
  });

  if (!response.ok) throw new Error(`Google Text Search failed: ${response.status} ${await response.text()}`);

  const data = await response.json();
  const candidates = ((data.places || []) as GooglePlace[])
    .map((place) => ({ place, ...calculateGoogleMatchConfidence(location, place) }))
    .sort((a, b) => b.confidence - a.confidence);
  const best = candidates[0];
  const confidence = best?.confidence || 0;
  const status = confidence >= 75 ? "matched" : confidence >= 55 ? "needs_review" : "no_match";

  return {
    place: best?.place || null,
    confidence,
    status,
    candidates: candidates.map(({ place, confidence }) => ({ place, confidence })),
    evidence: { query, ...(best?.evidence || {}) },
  };
}

export async function getGooglePlaceDetails(placeId: string): Promise<GooglePlace> {
  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: {
      "X-Goog-Api-Key": googleApiKey(),
      "X-Goog-FieldMask": GOOGLE_PLACE_DETAILS_FIELD_MASK,
    },
  });

  if (!response.ok) throw new Error(`Google Place Details failed: ${response.status} ${await response.text()}`);
  return response.json();
}

function containsPhrase(haystack: string, phrase: string) {
  return new RegExp(`(^|\\W)${escapeRegex(phrase.replace(/-/g, " "))}(\\W|$)`, "i").test(
    haystack.replace(/-/g, " "),
  );
}

function addPatch(target: LocationFoodTermPatch, patch: Partial<LocationFoodTermPatch>) {
  target.foodTerms.push(...(patch.foodTerms || []));
  target.cuisineTerms.push(...(patch.cuisineTerms || []));
  target.categoryTerms.push(...(patch.categoryTerms || []));
  target.featureTerms.push(...(patch.featureTerms || []));
  target.searchKeywords.push(...(patch.searchKeywords || []));
  target.semanticTags.push(...(patch.semanticTags || []));
  target.intentTags.push(...(patch.intentTags || []));
}

export function inferFoodTermsFromGooglePlace(place: GooglePlace, _location: GoogleLocationLike): LocationFoodTermPatch & { evidence: Record<string, unknown> } {
  const googleTextEvidence = normalizeText([
    place.displayName?.text,
    place.editorialSummary?.text,
  ].filter(Boolean).join(" "));
  const googleTypes = [place.primaryType, ...(place.types || [])].filter(Boolean) as string[];
  const patch: LocationFoodTermPatch = {
    foodTerms: [], cuisineTerms: [], categoryTerms: [], featureTerms: [], searchKeywords: [], semanticTags: [], intentTags: [],
  };
  const matchedGoogleTypes: string[] = [];
  const explicitFoodEvidence: string[] = [];
  const explicitFeatureEvidence: string[] = [];

  for (const type of googleTypes) {
    const mapped = GOOGLE_TYPE_TO_TERMS[type];
    if (mapped) {
      addPatch(patch, mapped);
      matchedGoogleTypes.push(type);
    }

    const cuisine = GOOGLE_CUISINE_TYPES[type];
    if (cuisine) {
      patch.cuisineTerms.push(cuisine);
      patch.categoryTerms.push("restaurant", `${cuisine} restaurant`);
      matchedGoogleTypes.push(type);
    }
  }

  for (const term of GOOGLE_EXPLICIT_FOOD_TERMS) {
    if (!containsPhrase(googleTextEvidence, term)) continue;
    patch.foodTerms.push(term);
    explicitFoodEvidence.push(term);
  }

  for (const term of GOOGLE_EXPLICIT_FEATURE_TERMS) {
    if (!containsPhrase(googleTextEvidence, term)) continue;
    const normalized = term === "roof top" ? "rooftop" : term === "cocktail" ? "cocktails" : term === "margarita" ? "margaritas" : term === "mimosa" ? "mimosas" : term;
    patch.featureTerms.push(normalized);
    explicitFeatureEvidence.push(normalized);
  }

  patch.foodTerms = cleanTerms(patch.foodTerms);
  patch.cuisineTerms = cleanTerms(patch.cuisineTerms);
  patch.categoryTerms = cleanTerms(patch.categoryTerms);
  patch.featureTerms = cleanTerms(patch.featureTerms);
  patch.searchKeywords = cleanTerms([...patch.foodTerms, ...patch.cuisineTerms, ...patch.categoryTerms, ...patch.featureTerms]);
  patch.semanticTags = cleanTerms(patch.searchKeywords);
  patch.intentTags = cleanTerms(patch.searchKeywords);

  return {
    ...patch,
    evidence: {
      evidenceMode: "google_direct_evidence_only",
      matchedGoogleTypes: cleanTerms(matchedGoogleTypes),
      explicitFoodEvidence: cleanTerms(explicitFoodEvidence),
      evidencedFeatures: cleanTerms(explicitFeatureEvidence),
      featureEvidenceMode: "google_explicit_text_only",
      googleTypes: place.types || [],
      googlePrimaryType: place.primaryType || null,
      googleDisplayName: place.displayName?.text || null,
      googleEditorialSummary: place.editorialSummary?.text || null,
    },
  };
}

export async function enrichLocationFromGoogle(location: GoogleLocationLike) {
  const initialMatch = location.google_place_id
    ? null
    : await findGooglePlaceForLocation(location);
  const placeId = location.google_place_id || initialMatch?.place?.id;

  if (!placeId || (initialMatch && initialMatch.confidence < 55)) {
    return {
      place: initialMatch?.place || null,
      confidence: initialMatch?.confidence || 0,
      status: "no_match" as const,
      suggestion: null,
      evidence: initialMatch?.evidence || { reason: "missing_place_id" },
    };
  }

  const details = await getGooglePlaceDetails(placeId);
  const { confidence, evidence } = calculateGoogleMatchConfidence(location, details);
  const status = confidence >= 75 ? "matched" : confidence >= 55 ? "needs_review" : "no_match";
  const suggestion = confidence >= 55 ? inferFoodTermsFromGooglePlace(details, location) : null;

  return {
    place: details,
    confidence,
    status,
    suggestion,
    evidence: { ...(initialMatch?.evidence || {}), ...evidence },
  };
}

export function buildGoogleSuggestionRow(sourceTable: string, location: GoogleLocationLike, place: GooglePlace, confidence: number, suggestion: ReturnType<typeof inferFoodTermsFromGooglePlace>, evidence: Record<string, unknown>, status = "pending") {
  return {
    source_table: sourceTable,
    source_id: location.id,
    google_place_id: place.id,
    location_name: locationName(location),
    google_display_name: place.displayName?.text || null,
    match_confidence: confidence,
    suggested_food_terms: suggestion.foodTerms,
    suggested_cuisine_terms: suggestion.cuisineTerms,
    suggested_category_terms: suggestion.categoryTerms,
    suggested_feature_terms: suggestion.featureTerms,
    suggested_search_keywords: suggestion.searchKeywords,
    suggested_semantic_tags: suggestion.semanticTags,
    suggested_intent_tags: suggestion.intentTags,
    google_types: place.types || [],
    google_primary_type: place.primaryType || null,
    evidence: { ...suggestion.evidence, ...evidence, googleFormattedAddress: place.formattedAddress || null },
    status,
  };
}

export function buildApplySuggestionUpdate(location: Record<string, unknown>, suggestion: Record<string, unknown>) {
  const search = mergeTextArrayTerms(location.search_keywords, toArray(suggestion.suggested_search_keywords));
  const semantic = mergeTextArrayTerms(location.semantic_tags, toArray(suggestion.suggested_semantic_tags));
  const intent = mergeTextArrayTerms(location.intent_tags, toArray(suggestion.suggested_intent_tags));
  const documentTerms = cleanTerms([
    ...toArray(suggestion.suggested_food_terms),
    ...toArray(suggestion.suggested_cuisine_terms),
    ...toArray(suggestion.suggested_category_terms),
    ...toArray(suggestion.suggested_feature_terms),
    ...search.added,
    ...semantic.added,
    ...intent.added,
  ]);
  return {
    search_keywords: search.merged,
    semantic_tags: semantic.merged,
    intent_tags: intent.merged,
    search_document: appendMissingTermsToText(location.search_document, documentTerms).text,
  };
}
