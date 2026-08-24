import { createClient } from "@supabase/supabase-js";
import { createClaimQr } from "@/lib/claimQrServer";
import { syncActivityToLocation, syncRestaurantToLocation } from "@/lib/sync-location";
import { extractReservationUrl } from "@/lib/reservation-links";
import {
  inferMarketFromPlace,
  parseGoogleAddressComponents,
  validatePlaceForMarket,
  type MarketKey,
  type MarketValidationResult,
} from "@/lib/location-market-validation";
import { normalizeMarketKey, normalizeMarketInput } from "@/lib/location-markets";
import {
  getPlaceDetailsLegacyCompat,
  publicGooglePlacePhotoUrl,
  searchPlacesTextLegacyCompat,
  type GooglePlaceLegacyCompat,
} from "@/lib/google/places-new-client";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const NYC_AREAS = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"];
const NORTHERN_NJ_AREAS = [
  "Jersey City NJ",
  "Hoboken NJ",
  "Newark NJ",
  "Montclair NJ",
  "Fort Lee NJ",
  "Edgewater NJ",
  "Hackensack NJ",
  "Bergen County NJ",
  "Hudson County NJ",
  "Essex County NJ",
];
const WESTCHESTER_AREAS = [
  "Westchester County NY",
  "White Plains NY",
  "Yonkers NY",
  "New Rochelle NY",
  "Mount Vernon NY",
  "Scarsdale NY",
  "Rye NY",
  "Tarrytown NY",
  "Port Chester NY",
];
const EXTENDED_AREAS = [
  ...NYC_AREAS,
  "Long Island",
  ...NORTHERN_NJ_AREAS,
  ...WESTCHESTER_AREAS,
];

const CUISINE_QUERIES = [
  "american restaurant",
  "soul food restaurant",
  "bbq restaurant",
  "steakhouse",
  "seafood restaurant",
  "italian restaurant",
  "pizza restaurant",
  "french restaurant",
  "spanish restaurant",
  "greek restaurant",
  "mediterranean restaurant",
  "mexican restaurant",
  "latin restaurant",
  "cuban restaurant",
  "dominican restaurant",
  "puerto rican restaurant",
  "peruvian restaurant",
  "caribbean restaurant",
  "jamaican restaurant",
  "chinese restaurant",
  "japanese restaurant",
  "sushi restaurant",
  "ramen restaurant",
  "korean restaurant",
  "thai restaurant",
  "vietnamese restaurant",
  "indian restaurant",
  "african restaurant",
  "nigerian restaurant",
  "ethiopian restaurant",
  "vegan restaurant",
  "vegetarian restaurant",
  "halal restaurant",
  "kosher restaurant",
  "brunch restaurant",
  "breakfast restaurant",
  "bakery",
  "cafe",
  "dessert restaurant",
  "burger restaurant",
  "wings restaurant",
  "fine dining restaurant",
  "wine bar",
  "cocktail bar",
  "sports bar",
  "rooftop restaurant",
  "hookah restaurant",
  "lounge restaurant",
];

const ACTIVITY_QUERIES = [
  "rooftop lounge",
  "speakeasy",
  "cocktail lounge",
  "jazz lounge",
  "live music lounge",
  "karaoke lounge",
  "hookah lounge",
  "cigar lounge",
  "bowling alley",
  "arcade bar",
  "escape room",
  "axe throwing",
  "paintball",
  "laser tag",
  "mini golf",
  "indoor golf",
  "pool hall",
  "billiards lounge",
  "go kart racing",
  "virtual reality arcade",
  "paint and sip",
  "pottery class",
  "candle making class",
  "perfume making experience",
  "cooking class",
  "dance class",
  "art class",
  "diy workshop",
  "couples spa",
  "massage spa",
  "sauna",
  "bath house",
  "wellness lounge",
  "yoga studio",
  "museum",
  "art gallery",
  "immersive exhibit",
  "indie movie theater",
  "live theater",
  "comedy club",
  "wine tasting",
  "dinner cruise",
  "sunset cruise",
  "botanical garden",
  "skating rink",
  "birthday activity",
  "group outing",
  "interactive experience",
  "party venue",
];

type ImportType = "restaurants" | "activities" | "both";
type ImportTable = "restaurants" | "activities";

type ImportCursor = {
  kind?: "restaurant" | "activity";
  areaIndex?: number;
  queryIndex?: number;
  placeIndex?: number;
};

type ImportPausedReason = "time_budget" | "checked_budget" | "imported_budget";

export type GooglePlacesImportOptions = {
  type?: ImportType | "all";
  limit?: number;
  batch?: string | null;
  areas?: string | null;
  primaryTag?: string | null;
  minRating?: number;
  maxQueries?: number;
  requirePhoto?: boolean;
  requirePhone?: boolean;
  requireWebsite?: boolean;
  requireLocation?: boolean;
  requireCuisineType?: boolean;
  requireHours?: boolean;
  requestedMarket?: MarketKey | string | null;
  requested_market?: MarketKey | string | null;
  market?: MarketKey | string | null;
  requestedArea?: string | null;
  allowMarketCorrection?: boolean;
  maxRuntimeMs?: number;
  stopAfterChecked?: number;
  stopAfterImported?: number;
  cursor?: ImportCursor | null;
  interactive?: boolean;
};

export type ImportMarketResolution = {
  original: string | null;
  resolved: MarketKey;
  source: string;
  confidence: "high" | "medium" | "low";
};

type GooglePlace = GooglePlaceLegacyCompat;

type ExistingLocationClaim = {
  id: string;
  claim_status?: string | null;
  claim_code?: string | null;
  claim_token?: string | null;
  claim_url?: string | null;
  claim_qr_url?: string | null;
  qr_link?: string | null;
  qr_code_data_url?: string | null;
};

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function valueText(value: unknown) {
  return Array.isArray(value) ? value.filter(Boolean).join(" ") : cleanText(value);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function uniqueArray(items: string[]) {
  return Array.from(
    new Set(items.map((item) => item.trim().toLowerCase()).filter(Boolean)),
  );
}

function cleanAddress(address: string | null | undefined) {
  return cleanText(address)
    .replace(/,\s*USA$/i, "")
    .replace(/,\s*United States$/i, "");
}

function parseAddressParts(address: string) {
  const cleaned = cleanAddress(address);
  const parts = cleaned.split(",").map((part) => part.trim());
  const city = parts.length >= 2 ? parts[parts.length - 2] : "";
  const stateZip = parts.length >= 1 ? parts[parts.length - 1] : "";
  const match = stateZip.match(/\b([A-Z]{2})\s+(\d{5})/);
  return {
    address: cleaned,
    city: city || "",
    state: match?.[1] || "",
    zip_code: match?.[2] || "",
  };
}

function normalizeWebsite(value: unknown) {
  const raw = cleanText(value).toLowerCase();
  if (!raw) return "";
  const withoutFragment = raw.split("#")[0]?.split("?")[0] || "";
  return withoutFragment
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "")
    .trim();
}

function normalizePhone(value: unknown) {
  return cleanText(value).replace(/\D/g, "");
}

function normalizeNameAddress(value: unknown) {
  return cleanAddress(cleanText(value))
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getReviewCount(place: GooglePlace) {
  return Number(place.user_ratings_total || place.review_count || 0);
}

function hasUsableHours(place: GooglePlace) {
  const openingHours = place.opening_hours as
    | { weekday_text?: unknown; periods?: unknown }
    | undefined;
  const candidates = [
    place.opening_hours,
    openingHours?.weekday_text,
    openingHours?.periods,
    place.current_opening_hours,
    place.regularOpeningHours,
    place.business_hours,
    place.hours,
    place.weekday_text,
  ];
  return candidates.some((value) => {
    if (!value) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "string") return value.trim().length > 0;
    if (typeof value === "object") {
      return Object.keys(value as Record<string, unknown>).length > 0;
    }
    return false;
  });
}

function shouldSkipPlace(place: GooglePlace, options: GooglePlacesImportOptions) {
  const rating = Number(place.rating || 0);
  const reviews = getReviewCount(place);
  const minRating = Number(options.minRating || 3.8);
  if (!place.place_id || !place.name) return true;
  if (place.business_status && place.business_status !== "OPERATIONAL") return true;
  if (rating && rating < minRating) return true;
  if (reviews && reviews < 10) return true;
  return false;
}

function hasRequiredImportFields(
  place: GooglePlace,
  addressParts: ReturnType<typeof parseAddressParts>,
  options: GooglePlacesImportOptions,
) {
  const hasPhoto = Boolean(place.photos?.[0]?.photo_reference);
  const hasPhone = Boolean(
    place.formatted_phone_number || place.international_phone_number,
  );
  const hasWebsite = Boolean(place.website || place.websiteUri);
  const hasLocation = Boolean(
    addressParts.address &&
      addressParts.city &&
      addressParts.state &&
      addressParts.zip_code,
  );

  if (options.requirePhoto !== false && !hasPhoto) return false;
  if (options.requirePhone !== false && !hasPhone) return false;
  if (options.requireWebsite !== false && !hasWebsite) return false;
  if (options.requireLocation !== false && !hasLocation) return false;
  if (options.requireHours !== false && !hasUsableHours(place)) return false;
  return true;
}

function score(place: GooglePlace) {
  const ratingScore = Number(place.rating || 0) * 14;
  const reviewScore = Math.min(25, Math.log10(getReviewCount(place) + 1) * 10);
  const photoScore = place.photos?.length ? 6 : 0;
  const websiteScore = place.website || place.websiteUri ? 5 : 0;
  return Math.max(
    50,
    Math.min(98, Math.round(ratingScore + reviewScore + photoScore + websiteScore)),
  );
}

function inferCuisine(textInput: string) {
  const text = textInput.toLowerCase();
  const cuisineMap: Record<string, string[]> = {
    steakhouse: ["steakhouse", "steak house", "steak"],
    seafood: ["seafood", "oyster", "fish", "lobster", "crab", "shrimp"],
    italian: ["italian", "pizza", "pizzeria", "pasta"],
    french: ["french", "bistro", "brasserie"],
    spanish: ["spanish", "tapas", "paella"],
    greek: ["greek", "gyro", "souvlaki"],
    mediterranean: ["mediterranean"],
    mexican: ["mexican", "taco", "taqueria", "burrito"],
    latin: ["latin", "latin american"],
    caribbean: ["caribbean", "jamaican", "haitian"],
    chinese: ["chinese", "cantonese", "sichuan", "dim sum", "hot pot"],
    japanese: ["japanese", "sushi", "ramen", "izakaya", "omakase"],
    korean: ["korean", "kbbq", "korean bbq"],
    thai: ["thai"],
    vietnamese: ["vietnamese", "pho", "banh mi"],
    indian: ["indian", "tandoori", "curry", "biryani"],
    african: ["african", "nigerian", "ethiopian"],
    soul_food: ["soul food"],
    bbq: ["bbq", "barbecue", "smokehouse"],
    american: ["american", "burger", "wings", "diner", "gastropub"],
    vegan: ["vegan", "plant based", "plant-based"],
    vegetarian: ["vegetarian"],
    halal: ["halal"],
    kosher: ["kosher"],
    brunch: ["brunch", "breakfast"],
    bakery: ["bakery", "pastry"],
    cafe: ["cafe", "coffee", "espresso"],
    dessert: ["dessert", "ice cream", "gelato", "cupcake", "donut"],
    wine_bar: ["wine bar"],
    cocktail_bar: ["cocktail bar", "mixology"],
    sports_bar: ["sports bar"],
    rooftop: ["rooftop"],
    lounge: ["lounge", "hookah", "shisha"],
  };
  const matches = Object.entries(cuisineMap)
    .filter(([, keywords]) => keywords.some((keyword) => text.includes(keyword)))
    .map(([cuisine]) => cuisine);
  return { primary: matches[0] || "restaurant", tags: uniqueArray(matches) };
}

function inferActivityType(textInput: string) {
  const text = textInput.toLowerCase();
  if (text.includes("hookah") || text.includes("shisha")) return "hookah";
  if (text.includes("cigar")) return "cigar";
  if (text.includes("karaoke")) return "karaoke";
  if (text.includes("bowling")) return "bowling";
  if (text.includes("arcade")) return "arcade";
  if (text.includes("escape")) return "escape_room";
  if (text.includes("axe")) return "axe_throwing";
  if (text.includes("paintball")) return "paintball";
  if (text.includes("golf")) return "golf";
  if (
    text.includes("paint") ||
    text.includes("pottery") ||
    text.includes("candle") ||
    text.includes("class")
  ) {
    return "creative";
  }
  if (
    text.includes("spa") ||
    text.includes("sauna") ||
    text.includes("wellness") ||
    text.includes("yoga")
  ) {
    return "wellness";
  }
  if (
    text.includes("museum") ||
    text.includes("gallery") ||
    text.includes("theater") ||
    text.includes("comedy")
  ) {
    return "culture";
  }
  if (
    text.includes("cruise") ||
    text.includes("wine tasting") ||
    text.includes("candlelight")
  ) {
    return "romantic";
  }
  if (
    text.includes("garden") ||
    text.includes("waterfront") ||
    text.includes("skating") ||
    text.includes("outdoor")
  ) {
    return "outdoor";
  }
  if (text.includes("birthday") || text.includes("party") || text.includes("group")) {
    return "birthday";
  }
  if (
    text.includes("rooftop") ||
    text.includes("speakeasy") ||
    text.includes("lounge")
  ) {
    return "nightlife";
  }
  return "activity";
}

function buildKeywords(place: GooglePlace, query: string, extras: string[] = []) {
  return uniqueArray(
    [
      place.name,
      query,
      ...(place.types || []),
      ...extras,
      place.formatted_address,
      place.vicinity,
    ]
      .filter(Boolean)
      .map(String),
  );
}

function resolveMarketCandidate(value: unknown): MarketKey {
  const text = valueText(value);
  return normalizeMarketKey(normalizeMarketInput(text) || text);
}

function formatCanonicalMarket(value: unknown): string | null {
  const market = resolveMarketCandidate(value);
  return market === "UNKNOWN" ? null : market;
}

function isDuplicatedSingleMarketValue(value: unknown): boolean {
  const text = valueText(value);
  if (!text) return false;
  const parts = text
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return (
    parts.length > 1 &&
    new Set(parts.map((part) => part.toLowerCase())).size === 1
  );
}

export function parseAreas(areas?: string | null) {
  const value = cleanText(areas || "nyc").toLowerCase();
  if (value === "nyc") return NYC_AREAS;
  if (value === "ct" || value === "connecticut") {
    return ["Stamford", "Norwalk", "Bridgeport", "New Haven", "Hartford"];
  }
  if (
    [
      "nj",
      "new_jersey",
      "new jersey",
      "northern_nj",
      "northern nj",
      "northern jersey",
      "north_jersey",
      "north jersey",
    ].includes(value)
  ) {
    return NORTHERN_NJ_AREAS;
  }
  if (value === "long_island" || value === "long island") {
    return ["Nassau County NY", "Suffolk County NY", "Garden City NY", "Huntington NY"];
  }
  if (value === "westchester") return WESTCHESTER_AREAS;
  if (value === "extended" || value === "all") return EXTENDED_AREAS;
  return cleanText(areas)
    .split(",")
    .map((area) => area.trim())
    .filter(Boolean);
}

export function resolveRequestedMarketForImport(
  options: GooglePlacesImportOptions = {},
  candidateMarket?: MarketKey | string | null,
  queriesUsed?: string[],
): ImportMarketResolution {
  const explicit = [
    ["settings.market", options.market],
    ["settings.requestedMarket", options.requestedMarket],
    ["settings.requested_market", options.requested_market],
  ] as const;

  const validExplicit = explicit
    .map(([source, value]) => ({
      source,
      original: valueText(value),
      resolved: resolveMarketCandidate(value),
    }))
    .find((candidate) => candidate.original && candidate.resolved !== "UNKNOWN");

  const areaText = [options.requestedArea, valueText(options.areas)]
    .filter(Boolean)
    .join(" ");
  const normalizedArea = resolveMarketCandidate(areaText);
  const areaMarket =
    normalizedArea !== "UNKNOWN"
      ? normalizedArea
      : normalizeMarketKey(
          inferMarketFromPlace({ requestedArea: areaText, query: areaText }),
        );

  if (areaMarket !== "UNKNOWN") {
    if (!validExplicit || validExplicit.resolved === areaMarket) {
      return {
        original: areaText,
        resolved: areaMarket,
        source: "settings.areas",
        confidence: "high",
      };
    }
    return {
      original: validExplicit.original,
      resolved: validExplicit.resolved,
      source: validExplicit.source,
      confidence: "high",
    };
  }

  if (validExplicit) {
    return {
      original: validExplicit.original,
      resolved: validExplicit.resolved,
      source: validExplicit.source,
      confidence: "high",
    };
  }

  const queryText = (queriesUsed || []).join(" ");
  const queryMarket = normalizeMarketKey(
    inferMarketFromPlace({ query: queryText, requestedArea: queryText }),
  );
  if (queryMarket !== "UNKNOWN") {
    return {
      original: queryText || null,
      resolved: queryMarket,
      source: "queries_used",
      confidence: "medium",
    };
  }

  const fallback = normalizeMarketKey(candidateMarket);
  if (fallback !== "UNKNOWN") {
    return {
      original: String(candidateMarket),
      resolved: fallback,
      source: "candidate_inferred_market",
      confidence: "low",
    };
  }

  return {
    original: areaText || null,
    resolved: "UNKNOWN",
    source: "unresolved",
    confidence: "low",
  };
}

export function formatRequestedMarketSourceForDisplay(
  resolution: ImportMarketResolution,
  settings: GooglePlacesImportOptions = {},
): string {
  if (resolution.source === "unresolved") return "Unresolved";
  if (resolution.source === "settings.areas") {
    const areas = parseAreas(settings.areas || resolution.original);
    if (areas.length) return `Areas: ${areas.join(", ")}`;
  }
  if (
    resolution.source === "settings.market" ||
    resolution.source === "settings.requestedMarket" ||
    resolution.source === "settings.requested_market" ||
    isDuplicatedSingleMarketValue(resolution.original)
  ) {
    return `Market: ${
      formatCanonicalMarket(resolution.original) || resolution.resolved
    }`;
  }
  if (resolution.resolved !== "UNKNOWN") return `Market: ${resolution.resolved}`;
  return resolution.original || "Unresolved";
}

export function formatRequestedMarketOriginalForResponse(
  resolution: ImportMarketResolution,
  settings: GooglePlacesImportOptions = {},
): string | null {
  if (isDuplicatedSingleMarketValue(resolution.original)) {
    return formatCanonicalMarket(resolution.original) || resolution.resolved;
  }
  if (resolution.source === "settings.areas") {
    return formatRequestedMarketSourceForDisplay(resolution, settings);
  }
  return resolution.original;
}

function validateImportMarket(
  place: GooglePlace,
  options: GooglePlacesImportOptions,
): MarketValidationResult {
  const parsed = parseGoogleAddressComponents(place.address_components);
  return validatePlaceForMarket({
    requestedMarket: resolveRequestedMarketForImport(
      options,
      inferMarketFromPlace({
        requestedArea: options.requestedArea || options.areas,
        query: options.areas || undefined,
      }),
    ).resolved,
    requestedArea: options.requestedArea || options.areas || null,
    formattedAddress: place.formatted_address || place.vicinity || null,
    addressComponents: place.address_components,
    city: parsed.city,
    state: parsed.state,
    county: parsed.county,
    borough: parsed.borough,
    neighborhood: parsed.neighborhood,
    postalCode: parsed.postalCode,
    latitude: place.geometry?.location?.lat || null,
    longitude: place.geometry?.location?.lng || null,
  });
}

async function findDuplicate(
  table: ImportTable,
  place: GooglePlace,
  addressParts: ReturnType<typeof parseAddressParts>,
) {
  const placeId = cleanText(place.place_id);
  if (placeId) {
    const { data } = await supabaseAdmin
      .from(table)
      .select("id,name,restaurant_name,activity_name")
      .eq("google_place_id", placeId)
      .limit(1);
    if (data?.[0]) {
      return {
        matchedBy: "google_place_id",
        existingId: String(data[0].id),
        existingName: cleanText(
          data[0].name || data[0].restaurant_name || data[0].activity_name,
        ),
      };
    }
  }

  const website = normalizeWebsite(place.website || place.websiteUri || place.url);
  const phone = normalizePhone(
    place.formatted_phone_number || place.international_phone_number,
  );
  const name = normalizeNameAddress(place.name);
  const address = normalizeNameAddress(addressParts.address);
  const { data } = await supabaseAdmin
    .from(table)
    .select("id,name,restaurant_name,activity_name,address,city,state,phone,website")
    .limit(5000);

  for (const row of data || []) {
    if (website && normalizeWebsite(row.website) === website) {
      return {
        matchedBy: "website",
        existingId: String(row.id),
        existingName: cleanText(row.name || row.restaurant_name || row.activity_name),
      };
    }
  }
  for (const row of data || []) {
    if (phone && normalizePhone(row.phone) === phone) {
      return {
        matchedBy: "phone",
        existingId: String(row.id),
        existingName: cleanText(row.name || row.restaurant_name || row.activity_name),
      };
    }
  }
  for (const row of data || []) {
    if (
      name &&
      address &&
      normalizeNameAddress(row.name || row.restaurant_name || row.activity_name) ===
        name &&
      normalizeNameAddress(row.address) === address
    ) {
      return {
        matchedBy: "name_address",
        existingId: String(row.id),
        existingName: cleanText(row.name || row.restaurant_name || row.activity_name),
      };
    }
  }
  return null;
}

async function addClaimFields(
  row: Record<string, unknown>,
  type: "restaurant" | "activity",
) {
  const qr = await createClaimQr(type);
  return {
    ...row,
    claim_status: qr.claim_status,
    claim_code: qr.claim_code,
    claim_token: qr.claim_token,
    claim_url: qr.claim_url,
    qr_link: qr.claim_url,
    claim_qr_url: qr.qr_code_data_url,
    qr_code_data_url: qr.qr_code_data_url,
  };
}

function getMissingColumn(errorMessage: string) {
  return (
    errorMessage.match(/'([^']+)' column/)?.[1] ||
    errorMessage.match(/column "([^"]+)"/)?.[1] ||
    null
  );
}

async function insertSupported(
  table: ImportTable,
  row: Record<string, unknown>,
) {
  const payload = { ...row };
  const removedColumns: string[] = [];
  for (let attempt = 0; attempt < 16; attempt++) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .insert(payload)
      .select("*")
      .single();
    if (!error) return { data, removedColumns };
    const missingColumn = getMissingColumn(error.message);
    if (missingColumn && missingColumn in payload) {
      delete payload[missingColumn];
      removedColumns.push(missingColumn);
      continue;
    }
    throw error;
  }
  throw new Error(
    `Unable to insert ${table}; unsupported columns removed: ${removedColumns.join(", ")}`,
  );
}

function formatAddedLocation(
  record: Record<string, unknown> | null,
  fallback: Record<string, unknown>,
  locationType: "restaurant" | "activity",
) {
  const source = record || fallback;
  const hours =
    source.opening_hours ||
    source.current_opening_hours ||
    source.regularOpeningHours ||
    source.hours ||
    source.weekday_text;
  return {
    id: source.id || null,
    name:
      source.name ||
      source.restaurant_name ||
      source.activity_name ||
      fallback.name ||
      null,
    location_type: source.location_type || locationType,
    market: source.market || null,
    city: source.city || source.borough || source.neighborhood || source.county || null,
    address: source.address || fallback.address || null,
    cuisine: source.cuisine || source.cuisine_type || source.food_type || null,
    category:
      source.primary_category ||
      source.category ||
      source.activity_type ||
      source.primary_tag ||
      source.cuisine ||
      null,
    rating: source.rating || null,
    website: source.website || source.website_url || null,
    phone: source.phone || source.phone_number || null,
    reservation_url:
      source.reservation_url || source.booking_url || source.reservation_link || null,
    hasPhoto: Boolean(
      source.image_url ||
        source.main_image ||
        source.photo_url ||
        source.has_photo ||
        source.has_photos,
    ),
    hasHours: Boolean(hours),
  };
}

async function savePlace(
  table: ImportTable,
  place: GooglePlace,
  query: string,
  options: GooglePlacesImportOptions,
) {
  if (!place.place_id || shouldSkipPlace(place, options)) {
    return { status: "skipped" as const };
  }

  let details: GooglePlace;
  try {
    details = await getPlaceDetailsLegacyCompat(place.place_id);
  } catch (error) {
    return { status: "failed" as const, error: getErrorMessage(error) };
  }

  const merged = { ...place, ...details };
  if (shouldSkipPlace(merged, options)) return { status: "skipped" as const };

  const addressParts = parseAddressParts(
    merged.formatted_address || merged.vicinity || "",
  );
  const validation = validateImportMarket(merged, options);
  if (!validation.ok) {
    return {
      status: validation.reason?.includes("state")
        ? ("skipped_wrong_state" as const)
        : ("skipped_wrong_market" as const),
      validation,
    };
  }

  if (!hasRequiredImportFields(merged, addressParts, options)) {
    return { status: "skipped" as const };
  }

  const duplicate = await findDuplicate(table, merged, addressParts);
  if (duplicate) {
    return {
      status: "skipped_duplicate" as const,
      duplicate: {
        name: merged.name || "Unknown Google Place",
        address: addressParts.address,
        locationType: table === "restaurants" ? "restaurant" : "activity",
        ...duplicate,
        reason: `Skipped because this location already exists (${duplicate.matchedBy}).`,
      },
    };
  }

  const commonScore = score(merged);
  const reservationUrl = extractReservationUrl(merged);
  const website = merged.website || merged.websiteUri || null;
  const googleMapsUrl = merged.url || merged.googleMapsUri || null;
  const placeId = merged.place_id;
  const imageUrl = placeId ? publicGooglePlacePhotoUrl(placeId) : null;
  const market = normalizeMarketKey(
    validation.correctedMarket || validation.inferredMarket || options.requestedMarket,
  );
  const hours =
    merged.opening_hours ||
    merged.current_opening_hours ||
    merged.regularOpeningHours ||
    null;

  const base: Record<string, unknown> = {
    name: merged.name,
    address: addressParts.address,
    city: addressParts.city,
    state: addressParts.state,
    zip_code: addressParts.zip_code,
    google_place_id: placeId,
    latitude: merged.geometry?.location?.lat || null,
    longitude: merged.geometry?.location?.lng || null,
    rating: Number(merged.rating || 0),
    review_count: getReviewCount(merged),
    theouthaven_score: commonScore,
    quality_score: commonScore,
    popularity_score: Math.min(
      100,
      Math.round(Math.log10(getReviewCount(merged) + 1) * 35),
    ),
    review_score: Number(merged.rating || 0) * 20,
    phone:
      merged.formatted_phone_number || merged.international_phone_number || null,
    website,
    google_maps_url: googleMapsUrl,
    reservation_url: reservationUrl,
    booking_url: reservationUrl,
    image_url: imageUrl,
    opening_hours: hours,
    current_opening_hours: merged.current_opening_hours || null,
    status: "approved",
    market,
    borough: validation.borough || null,
    county: validation.county || null,
    neighborhood: validation.neighborhood || null,
    google_types: merged.types || [],
    source: "google_places_new",
  };

  let row: Record<string, unknown>;
  if (table === "restaurants") {
    const cuisine = inferCuisine(
      `${merged.name} ${query} ${(merged.types || []).join(" ")}`,
    );
    if (options.requireCuisineType !== false && !cuisine.primary) {
      return { status: "skipped" as const };
    }
    row = await addClaimFields(
      {
        ...base,
        restaurant_name: merged.name,
        location_type: "restaurant",
        cuisine: cuisine.primary,
        food_type: cuisine.primary,
        cuisine_type: cuisine.primary,
        cuisine_tags: cuisine.tags,
        primary_tag: cuisine.primary,
        search_keywords: buildKeywords(merged, query, cuisine.tags),
      },
      "restaurant",
    );
  } else {
    const activityType = inferActivityType(
      `${merged.name} ${query} ${(merged.types || []).join(" ")}`,
    );
    row = await addClaimFields(
      {
        ...base,
        activity_name: merged.name,
        location_type: "activity",
        activity_type: activityType,
        primary_tag: activityType,
        search_keywords: buildKeywords(merged, query, [activityType]),
        date_style_tags: uniqueArray([
          activityType,
          "date night",
          "group-friendly",
          "fun",
        ]),
        atmosphere:
          "TheOutHaven-friendly outing, date-night, social, and group-friendly",
      },
      "activity",
    );
  }

  try {
    const { data } = await insertSupported(table, row);
    if (table === "restaurants") {
      await syncRestaurantToLocation(
        (data || row) as Record<string, unknown> & { id: string | number },
      );
    } else {
      await syncActivityToLocation(
        (data || row) as Record<string, unknown> & { id: string | number },
      );
    }
    return {
      status: "imported" as const,
      validation,
      location: formatAddedLocation(
        data as Record<string, unknown> | null,
        row,
        table === "restaurants" ? "restaurant" : "activity",
      ),
    };
  } catch (error) {
    return { status: "failed" as const, error: getErrorMessage(error) };
  }
}

function createStats() {
  return {
    checked: 0,
    imported: 0,
    skipped: 0,
    failed: 0,
    skipped_duplicate: 0,
    skipped_wrong_state: 0,
    skipped_wrong_market: 0,
    skipped_out_of_area: 0,
    market_mismatch_count: 0,
    imported_by_market: {} as Record<string, number>,
    skipped_by_reason: {} as Record<string, number>,
    rejected_examples: [] as Record<string, unknown>[],
    duplicate_examples: [] as Record<string, unknown>[],
    wrong_state_examples: [] as Record<string, unknown>[],
    wrong_market_examples: [] as Record<string, unknown>[],
    inferred_market_counts: {} as Record<string, number>,
    state_counts: {} as Record<string, number>,
    errors: [] as string[],
    queries_used: [] as string[],
    addedLocations: [] as ReturnType<typeof formatAddedLocation>[],
  };
}

export function mergeCountMaps(...maps: Array<Record<string, number>>) {
  return maps.reduce<Record<string, number>>((merged, map) => {
    for (const [key, value] of Object.entries(map)) {
      merged[key] = (merged[key] || 0) + value;
    }
    return merged;
  }, {});
}

export function normalizeImportSkipCounts<
  T extends { skipped_wrong_market: number; market_mismatch_count: number },
>(stats: T): T {
  stats.market_mismatch_count = stats.skipped_wrong_market;
  return stats;
}

function rotateQueries(queries: string[], maxQueries: number) {
  if (queries.length <= maxQueries) return queries;
  const daySeed = Math.floor(Date.now() / 86_400_000);
  const start = (daySeed * maxQueries) % queries.length;
  return Array.from(
    { length: maxQueries },
    (_, index) => queries[(start + index) % queries.length],
  );
}

function filterQueries(queries: string[], batch?: string | null, maxQueries = 24) {
  const value = cleanText(batch).toLowerCase();
  if (!value || value === "all") return rotateQueries(queries, maxQueries);
  if (value === "cuisine" || value === "food") {
    return rotateQueries(CUISINE_QUERIES, maxQueries);
  }

  const patterns: Record<string, RegExp> = {
    fun: /lounge|hookah|karaoke|arcade|bowling|escape|paint|golf|comedy|cruise|activity|party|interactive/,
    birthday: /birthday|party|group|brunch|restaurant|activity|interactive/,
    romantic: /rooftop|wine|cocktail|lounge|spa|cruise|fine dining|jazz/,
    luxury: /fine dining|steakhouse|seafood|wine|cocktail|rooftop|spa|lounge/,
    nightlife: /lounge|speakeasy|cocktail|jazz|karaoke|hookah|cigar|rooftop|club/,
    hookah: /hookah|shisha|cigar/,
    games: /bowling|arcade|escape|axe|paintball|laser|golf|billiards|kart|virtual reality/,
    creative: /paint|pottery|candle|perfume|cooking|dance|art|diy/,
    wellness: /spa|massage|sauna|bath|wellness|yoga/,
    culture: /museum|gallery|music|theater|comedy|cinema|exhibit/,
  };

  const pattern = patterns[value];
  const filtered = pattern
    ? queries.filter((query) => pattern.test(query.toLowerCase()))
    : queries.filter((query) =>
        query.toLowerCase().includes(value.replace(/_/g, " ")),
      );
  return rotateQueries(filtered.length ? filtered : queries, maxQueries);
}

function shouldStop(
  startedAt: number,
  options: GooglePlacesImportOptions,
  stats: { checked: number; imported: number },
): ImportPausedReason | null {
  const maxRuntimeMs = Number(options.maxRuntimeMs || 0);
  if (maxRuntimeMs && Date.now() - startedAt >= Math.max(5_000, maxRuntimeMs)) {
    return "time_budget";
  }
  if (options.stopAfterChecked && stats.checked >= options.stopAfterChecked) {
    return "checked_budget";
  }
  if (options.stopAfterImported && stats.imported >= options.stopAfterImported) {
    return "imported_budget";
  }
  return null;
}

async function runGroup(
  kind: "restaurant" | "activity",
  queries: string[],
  areas: string[],
  limit: number,
  seen: Set<string>,
  options: GooglePlacesImportOptions,
  startedAt: number,
) {
  const stats = createStats();
  const cursor = options.cursor?.kind === kind ? options.cursor : null;
  const startArea = Math.max(0, Number(cursor?.areaIndex || 0));

  for (let areaIndex = startArea; areaIndex < areas.length; areaIndex++) {
    const startQuery =
      areaIndex === startArea ? Math.max(0, Number(cursor?.queryIndex || 0)) : 0;

    for (let queryIndex = startQuery; queryIndex < queries.length; queryIndex++) {
      const query = `${queries[queryIndex]} in ${areas[areaIndex]}`;
      stats.queries_used.push(query);

      try {
        const places = (await searchPlacesTextLegacyCompat(query)).slice(0, limit);
        const startPlace =
          areaIndex === startArea && queryIndex === startQuery
            ? Math.max(0, Number(cursor?.placeIndex || 0))
            : 0;

        for (let placeIndex = startPlace; placeIndex < places.length; placeIndex++) {
          const stopBefore = shouldStop(startedAt, options, stats);
          if (stopBefore) {
            return {
              stats: normalizeImportSkipCounts(stats),
              nextCursor: { kind, areaIndex, queryIndex, placeIndex },
              completed: false,
              pausedReason: stopBefore,
            };
          }

          const place = places[placeIndex];
          if (!place.place_id) continue;
          stats.checked += 1;

          if (seen.has(place.place_id)) {
            stats.skipped += 1;
            stats.skipped_duplicate += 1;
            stats.skipped_by_reason.duplicate =
              (stats.skipped_by_reason.duplicate || 0) + 1;
          } else {
            seen.add(place.place_id);
            const result = await savePlace(
              kind === "restaurant" ? "restaurants" : "activities",
              place,
              query,
              options,
            );

            if (result.status === "imported") {
              stats.imported += 1;
              if (result.location) stats.addedLocations.push(result.location);
              const market = normalizeMarketKey(
                result.validation?.correctedMarket ||
                  result.validation?.inferredMarket ||
                  options.requestedMarket,
              );
              stats.imported_by_market[market] =
                (stats.imported_by_market[market] || 0) + 1;
            } else if (result.status === "skipped") {
              stats.skipped += 1;
              stats.skipped_by_reason.low_quality =
                (stats.skipped_by_reason.low_quality || 0) + 1;
            } else if (result.status === "skipped_duplicate") {
              stats.skipped += 1;
              stats.skipped_duplicate += 1;
              stats.skipped_by_reason.duplicate =
                (stats.skipped_by_reason.duplicate || 0) + 1;
              if (result.duplicate && stats.duplicate_examples.length < 25) {
                stats.duplicate_examples.push(result.duplicate);
              }
            } else if (
              result.status === "skipped_wrong_state" ||
              result.status === "skipped_wrong_market"
            ) {
              stats.skipped += 1;
              const validation = result.validation;
              if (result.status === "skipped_wrong_state") {
                stats.skipped_wrong_state += 1;
                stats.skipped_by_reason.wrong_state =
                  (stats.skipped_by_reason.wrong_state || 0) + 1;
              } else {
                stats.skipped_wrong_market += 1;
                stats.skipped_by_reason.wrong_market =
                  (stats.skipped_by_reason.wrong_market || 0) + 1;
              }
              if (validation) {
                const inferred = normalizeMarketKey(validation.inferredMarket);
                stats.inferred_market_counts[inferred] =
                  (stats.inferred_market_counts[inferred] || 0) + 1;
                if (validation.state) {
                  stats.state_counts[validation.state] =
                    (stats.state_counts[validation.state] || 0) + 1;
                }
                const example = {
                  name: place.name,
                  address: place.formatted_address || place.vicinity,
                  requestedMarket: normalizeMarketKey(validation.requestedMarket),
                  detectedState: validation.state,
                  detectedCity: validation.city,
                  primary_reason:
                    result.status === "skipped_wrong_state"
                      ? "wrong_state"
                      : "wrong_market",
                  reason: validation.reason,
                };
                if (stats.rejected_examples.length < 10) {
                  stats.rejected_examples.push(example);
                }
                if (
                  result.status === "skipped_wrong_state" &&
                  stats.wrong_state_examples.length < 10
                ) {
                  stats.wrong_state_examples.push(example);
                }
                if (
                  result.status === "skipped_wrong_market" &&
                  stats.wrong_market_examples.length < 10
                ) {
                  stats.wrong_market_examples.push(example);
                }
              }
            } else if (result.status === "failed") {
              stats.failed += 1;
              if (result.error) stats.errors.push(`${query}: ${result.error}`);
            }
          }

          const stopAfter = shouldStop(startedAt, options, stats);
          if (stopAfter) {
            const nextCursor =
              placeIndex + 1 < places.length
                ? { kind, areaIndex, queryIndex, placeIndex: placeIndex + 1 }
                : queryIndex + 1 < queries.length
                  ? { kind, areaIndex, queryIndex: queryIndex + 1, placeIndex: 0 }
                  : areaIndex + 1 < areas.length
                    ? { kind, areaIndex: areaIndex + 1, queryIndex: 0, placeIndex: 0 }
                    : null;
            return {
              stats: normalizeImportSkipCounts(stats),
              nextCursor,
              completed: nextCursor === null,
              pausedReason: stopAfter,
            };
          }
        }
      } catch (error) {
        stats.failed += 1;
        stats.errors.push(`${query}: ${getErrorMessage(error)}`);
      }
    }
  }

  return {
    stats: normalizeImportSkipCounts(stats),
    nextCursor: null as ImportCursor | null,
    completed: true,
    pausedReason: null as ImportPausedReason | null,
  };
}

export async function runGooglePlacesImport(
  options: GooglePlacesImportOptions = {},
) {
  if (!process.env.GOOGLE_PLACES_API_KEY?.trim()) {
    throw new Error("Missing GOOGLE_PLACES_API_KEY.");
  }

  const type = options.type === "all" ? "both" : options.type || "both";
  const limit = Math.max(1, Math.min(Number(options.limit || 10), 20));
  const maxQueries = Math.max(1, Math.min(Number(options.maxQueries || 2), 12));
  const areas = parseAreas(options.areas);
  const marketResolution = resolveRequestedMarketForImport(options);
  const requestedMarket = marketResolution.resolved;
  const requestedMarketOriginal = formatRequestedMarketOriginalForResponse(
    marketResolution,
    options,
  );
  const requestedMarketDisplay = formatRequestedMarketSourceForDisplay(
    marketResolution,
    options,
  );
  options = { ...options, requestedMarket };

  const primaryTag = options.primaryTag || options.batch || "all";
  const restaurantQueries = filterQueries(CUISINE_QUERIES, primaryTag, maxQueries);
  const activityQueries = filterQueries(ACTIVITY_QUERIES, primaryTag, maxQueries);
  const seen = new Set<string>();
  const startedAt = Date.now();
  const emptyGroup = {
    stats: createStats(),
    nextCursor: null as ImportCursor | null,
    completed: true,
    pausedReason: null as ImportPausedReason | null,
  };

  let restaurantRun = emptyGroup;
  let activityRun = emptyGroup;

  if (type !== "activities" && options.cursor?.kind !== "activity") {
    restaurantRun = await runGroup(
      "restaurant",
      restaurantQueries,
      areas,
      limit,
      seen,
      options,
      startedAt,
    );
  }

  if (type !== "restaurants" && restaurantRun.completed) {
    activityRun = await runGroup(
      "activity",
      activityQueries,
      areas,
      limit,
      seen,
      options.cursor?.kind === "restaurant" ? { ...options, cursor: null } : options,
      startedAt,
    );
  }

  const restaurant = restaurantRun.stats;
  const activity = activityRun.stats;
  const completed =
    restaurantRun.completed && (type === "restaurants" || activityRun.completed);
  const pausedReason = restaurantRun.pausedReason || activityRun.pausedReason;
  const nextCursor =
    restaurantRun.nextCursor ||
    activityRun.nextCursor ||
    (!completed && type === "both" && restaurantRun.completed
      ? ({ kind: "activity", areaIndex: 0, queryIndex: 0, placeIndex: 0 } as const)
      : null);
  const partial = !completed;

  if (completed) {
    await supabaseAdmin
      .from("ai_response_cache")
      .delete()
      .gte("created_at", "2000-01-01");
  }

  const imported = restaurant.imported + activity.imported;
  const skipped = restaurant.skipped + activity.skipped;
  const failed = restaurant.failed + activity.failed;
  const checked = restaurant.checked + activity.checked;
  const errors = [...restaurant.errors, ...activity.errors];
  const importedByMarket = mergeCountMaps(
    restaurant.imported_by_market,
    activity.imported_by_market,
  );
  const skippedByReason = mergeCountMaps(
    restaurant.skipped_by_reason,
    activity.skipped_by_reason,
  );

  const result = {
    success: failed === 0 || imported + skipped > 0,
    completed,
    partial,
    pausedReason,
    paused_reason: pausedReason,
    nextCursor,
    cursor: nextCursor,
    message: completed
      ? "Google Places API (New) import completed."
      : "Google import paused safely before the server timeout. Continue the import to process the next batch.",
    imported,
    skipped,
    failed,
    checked,
    total_found_from_google: checked,
    restaurant,
    activity,
    skipped_duplicate: restaurant.skipped_duplicate + activity.skipped_duplicate,
    duplicateCount: restaurant.skipped_duplicate + activity.skipped_duplicate,
    duplicatesSkipped: [
      ...restaurant.duplicate_examples,
      ...activity.duplicate_examples,
    ].slice(0, 25),
    skipped_wrong_state:
      restaurant.skipped_wrong_state + activity.skipped_wrong_state,
    skipped_wrong_market:
      restaurant.skipped_wrong_market + activity.skipped_wrong_market,
    skipped_out_of_area:
      restaurant.skipped_out_of_area + activity.skipped_out_of_area,
    rejected_examples: [
      ...restaurant.rejected_examples,
      ...activity.rejected_examples,
    ].slice(0, 10),
    duplicate_examples: [
      ...restaurant.duplicate_examples,
      ...activity.duplicate_examples,
    ].slice(0, 10),
    wrong_state_examples: [
      ...restaurant.wrong_state_examples,
      ...activity.wrong_state_examples,
    ].slice(0, 10),
    wrong_market_examples: [
      ...restaurant.wrong_market_examples,
      ...activity.wrong_market_examples,
    ].slice(0, 10),
    queries_used: [...restaurant.queries_used, ...activity.queries_used],
    imported_by_market: importedByMarket,
    skipped_by_reason: skippedByReason,
    requested_market: requestedMarket,
    requested_market_original: requestedMarketOriginal,
    requested_market_display: requestedMarketDisplay,
    requested_market_resolved: marketResolution.resolved,
    requested_market_source: marketResolution.source,
    market_resolution_confidence: marketResolution.confidence,
    inferred_market_counts: mergeCountMaps(
      restaurant.inferred_market_counts,
      activity.inferred_market_counts,
    ),
    state_counts: mergeCountMaps(restaurant.state_counts, activity.state_counts),
    market_mismatch_count:
      restaurant.skipped_wrong_market + activity.skipped_wrong_market,
    errors: errors.slice(0, 30),
    addedLocations: [...restaurant.addedLocations, ...activity.addedLocations],
    settings: {
      type,
      limit,
      batch: primaryTag,
      primaryTag,
      minRating: Number(options.minRating || 3.8),
      maxQueries,
      areas,
      requirePhoto: options.requirePhoto !== false,
      requirePhone: options.requirePhone !== false,
      requireWebsite: options.requireWebsite !== false,
      requireLocation: options.requireLocation !== false,
      requireCuisineType: options.requireCuisineType !== false,
      requireHours: options.requireHours !== false,
      interactive: options.interactive === true,
      maxRuntimeMs: options.maxRuntimeMs,
      stopAfterChecked: options.stopAfterChecked,
      stopAfterImported: options.stopAfterImported,
      cursor: options.cursor || null,
    },
  };

  await supabaseAdmin.from("import_logs").insert({
    job_name: "google_places_import_new",
    imported_count: imported,
    error: errors.length ? errors.slice(0, 5).join("; ") : null,
    meta: result,
  });

  return result;
}
