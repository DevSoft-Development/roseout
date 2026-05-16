import { createClient } from "@supabase/supabase-js";
import { createClaimQr } from "@/lib/claimQr";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

const NYC_AREAS = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"];
const EXTENDED_AREAS = [
  ...NYC_AREAS,
  "Long Island",
  "Jersey City",
  "Hoboken",
  "Newark",
  "Westchester",
];

const CUISINE_QUERIES = [
  "american restaurant",
  "new american restaurant",
  "comfort food restaurant",
  "southern restaurant",
  "soul food restaurant",
  "cajun restaurant",
  "creole restaurant",
  "bbq restaurant",
  "steakhouse",
  "seafood restaurant",
  "oyster bar",
  "italian restaurant",
  "pizza restaurant",
  "french restaurant",
  "spanish restaurant",
  "tapas restaurant",
  "greek restaurant",
  "mediterranean restaurant",
  "turkish restaurant",
  "middle eastern restaurant",
  "lebanese restaurant",
  "moroccan restaurant",
  "mexican restaurant",
  "tex mex restaurant",
  "latin restaurant",
  "cuban restaurant",
  "dominican restaurant",
  "puerto rican restaurant",
  "colombian restaurant",
  "peruvian restaurant",
  "brazilian restaurant",
  "argentinian restaurant",
  "caribbean restaurant",
  "jamaican restaurant",
  "haitian restaurant",
  "trinidadian restaurant",
  "chinese restaurant",
  "cantonese restaurant",
  "sichuan restaurant",
  "dim sum restaurant",
  "hot pot restaurant",
  "japanese restaurant",
  "sushi restaurant",
  "ramen restaurant",
  "izakaya",
  "korean restaurant",
  "korean bbq restaurant",
  "thai restaurant",
  "vietnamese restaurant",
  "filipino restaurant",
  "indian restaurant",
  "pakistani restaurant",
  "bangladeshi restaurant",
  "nepalese restaurant",
  "afghan restaurant",
  "persian restaurant",
  "african restaurant",
  "west african restaurant",
  "nigerian restaurant",
  "ethiopian restaurant",
  "egyptian restaurant",
  "vegan restaurant",
  "vegetarian restaurant",
  "halal restaurant",
  "kosher restaurant",
  "gluten free restaurant",
  "organic restaurant",
  "farm to table restaurant",
  "brunch restaurant",
  "breakfast restaurant",
  "bakery",
  "cafe",
  "dessert restaurant",
  "ice cream shop",
  "juice bar",
  "healthy restaurant",
  "burger restaurant",
  "fried chicken restaurant",
  "wings restaurant",
  "sandwich shop",
  "deli",
  "bagel shop",
  "noodle restaurant",
  "buffet restaurant",
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
  "latin lounge",
  "afrobeat lounge",
  "hookah lounge",
  "shisha lounge",
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
  "sushi making class",
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
  "poetry lounge",
  "indie movie theater",
  "live theater",
  "comedy club",
  "wine tasting",
  "rooftop cinema",
  "dinner cruise",
  "sunset cruise",
  "candlelight concert",
  "botanical garden",
  "waterfront activity",
  "skating rink",
  "outdoor movie",
  "holiday market",
  "birthday activity",
  "group outing",
  "interactive experience",
  "party venue",
];

type ImportType = "restaurants" | "activities" | "both";

type GooglePlace = {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  vicinity?: string;
  formatted_phone_number?: string;
  international_phone_number?: string;
  website?: string;
  url?: string;
  rating?: number | string;
  user_ratings_total?: number | string;
  review_count?: number | string;
  business_status?: string;
  types?: string[];
  photos?: { photo_reference?: string }[];
  geometry?: { location?: { lat?: number; lng?: number } };
};

type GoogleTextSearchResponse = {
  status?: string;
  error_message?: string;
  results?: GooglePlace[];
};

type GoogleDetailsResponse = {
  status?: string;
  result?: GooglePlace;
};

type ImportTable = "restaurants" | "activities";

type ExistingLocationClaim = {
  id: string;
  is_claimed?: boolean | null;
  claimed?: boolean | null;
  claim_status?: string | null;
  claimed_at?: string | null;
  claimed_by_email?: string | null;
  owner_user_id?: string | null;
  claim_token?: string | null;
  claim_url?: string | null;
  qr_code_data_url?: string | null;
};

type SaveLocationError = { message: string };

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}


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
};

function getGoogleKey() {
  return (
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function uniqueArray(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim().toLowerCase()).filter(Boolean)));
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

function getReviewCount(place: GooglePlace) {
  return Number(place.user_ratings_total || place.review_count || 0);
}

function getPhotoUrl(photoReference?: string | null) {
  const key = getGoogleKey();
  if (!key || !photoReference) return null;
  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${photoReference}&key=${key}`;
}

function shouldSkipPlace(place: GooglePlace, options: GooglePlacesImportOptions = {}) {
  const rating = Number(place.rating || 0);
  const reviews = getReviewCount(place);
  const minRating = Number(options.minRating || 3.8);

  if (!place.place_id || !place.name) return true;
  if (place.business_status && place.business_status !== "OPERATIONAL") return true;
  if (rating && rating < minRating) return true;
  if (reviews && reviews < 10) return true;

  return false;
}

function getTheOutHavenScore(place: GooglePlace) {
  const ratingScore = Number(place.rating || 0) * 14;
  const reviewScore = Math.min(25, Math.log10(getReviewCount(place) + 1) * 10);
  const photoScore = place.photos?.length ? 6 : 0;
  const websiteScore = place.website ? 5 : 0;
  return Math.max(50, Math.min(98, Math.round(ratingScore + reviewScore + photoScore + websiteScore)));
}

function hasRequiredImportFields(
  place: GooglePlace,
  addressParts: ReturnType<typeof parseAddressParts>,
  options: GooglePlacesImportOptions = {}
) {
  const hasPhoto = Boolean(place.photos?.[0]?.photo_reference);
  const hasPhone = Boolean(place.formatted_phone_number || place.international_phone_number);
  const hasWebsite = Boolean(place.website);
  const hasLocation = Boolean(
    addressParts.address && addressParts.city && addressParts.state && addressParts.zip_code
  );

  if (options.requirePhoto !== false && !hasPhoto) return false;
  if (options.requirePhone !== false && !hasPhone) return false;
  if (options.requireWebsite !== false && !hasWebsite) return false;
  if (options.requireLocation !== false && !hasLocation) return false;

  return true;
}

function inferCuisine(textInput: string) {
  const text = textInput.toLowerCase();
  const cuisineMap: Record<string, string[]> = {
    steakhouse: ["steakhouse", "steak house", "steak"],
    seafood: ["seafood", "oyster", "fish", "lobster", "crab", "shrimp"],
    italian: ["italian", "pizza", "pizzeria", "pasta", "trattoria", "ristorante"],
    french: ["french", "bistro", "brasserie"],
    spanish: ["spanish", "tapas", "paella"],
    greek: ["greek", "gyro", "souvlaki"],
    mediterranean: ["mediterranean"],
    turkish: ["turkish", "kebab", "doner"],
    middle_eastern: ["middle eastern", "falafel", "shawarma", "hummus"],
    mexican: ["mexican", "taco", "taqueria", "burrito", "tortas"],
    latin: ["latin", "latin american"],
    caribbean: ["caribbean", "jamaican", "haitian", "trinidadian"],
    chinese: ["chinese", "cantonese", "sichuan", "szechuan", "dim sum", "hot pot"],
    japanese: ["japanese", "sushi", "ramen", "izakaya", "omakase"],
    korean: ["korean", "kbbq", "korean bbq"],
    thai: ["thai"],
    vietnamese: ["vietnamese", "pho", "banh mi"],
    filipino: ["filipino", "pinoy"],
    indian: ["indian", "tandoori", "curry", "masala", "biryani"],
    african: ["african", "nigerian", "ethiopian", "west african"],
    soul_food: ["soul food"],
    southern: ["southern", "cajun", "creole"],
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
    healthy: ["healthy", "salad", "juice", "smoothie"],
    fine_dining: ["fine dining"],
    wine_bar: ["wine bar"],
    cocktail_bar: ["cocktail bar", "mixology"],
    sports_bar: ["sports bar"],
    rooftop: ["rooftop"],
    lounge: ["lounge", "hookah", "shisha"],
  };

  const matches = Object.entries(cuisineMap)
    .filter(([, keywords]) => keywords.some((keyword) => text.includes(keyword)))
    .map(([cuisine]) => cuisine);

  return {
    primary: matches[0] || "restaurant",
    tags: uniqueArray(matches),
  };
}

function inferActivityType(textInput: string) {
  const text = textInput.toLowerCase();
  if (text.includes("hookah") || text.includes("shisha")) return "hookah";
  if (text.includes("cigar")) return "cigar";
  if (text.includes("rooftop") || text.includes("speakeasy") || text.includes("lounge")) return "nightlife";
  if (text.includes("karaoke")) return "karaoke";
  if (text.includes("bowling")) return "bowling";
  if (text.includes("arcade")) return "arcade";
  if (text.includes("escape")) return "escape_room";
  if (text.includes("axe")) return "axe_throwing";
  if (text.includes("paintball")) return "paintball";
  if (text.includes("golf")) return "golf";
  if (text.includes("paint") || text.includes("pottery") || text.includes("candle") || text.includes("class")) return "creative";
  if (text.includes("spa") || text.includes("sauna") || text.includes("wellness") || text.includes("yoga")) return "wellness";
  if (text.includes("museum") || text.includes("gallery") || text.includes("theater") || text.includes("comedy")) return "culture";
  if (text.includes("cruise") || text.includes("wine tasting") || text.includes("candlelight")) return "romantic";
  if (text.includes("garden") || text.includes("waterfront") || text.includes("skating") || text.includes("outdoor")) return "outdoor";
  if (text.includes("birthday") || text.includes("party") || text.includes("group")) return "birthday";
  return "activity";
}

function buildKeywords(place: GooglePlace, query: string, extras: string[] = []) {
  return uniqueArray([
    place.name,
    query,
    ...(place.types || []),
    ...extras,
    place.formatted_address,
    place.vicinity,
  ].filter(Boolean).map(String));
}

async function findExistingLocation(table: ImportTable, placeId: string) {
  const { data, error } = await supabaseAdmin
    .from(table)
    .select("id, is_claimed, claimed, claim_status, claimed_at, claimed_by_email, owner_user_id, claim_token, claim_url, qr_code_data_url")
    .eq("google_place_id", placeId)
    .limit(1);

  if (error) throw new Error(error.message);

  return (data?.[0] || null) as ExistingLocationClaim | null;
}

async function addClaimFields(
  row: Record<string, unknown>,
  existing: ExistingLocationClaim | null,
  type: "restaurant" | "activity"
) {
  if (
    existing?.claim_status &&
    existing?.claim_token &&
    existing?.claim_url &&
    existing?.qr_code_data_url
  ) {
    return {
      ...row,
      claim_status: existing.claim_status,
      claim_token: existing.claim_token,
      claim_url: existing.claim_url,
      qr_code_data_url: existing.qr_code_data_url,
    };
  }

  const qr = await createClaimQr(type);

  return {
    ...row,
    claim_status: existing?.claim_status || qr.claim_status,
    claim_token: existing?.claim_token || qr.claim_token,
    claim_url: existing?.claim_url || qr.claim_url,
    qr_code_data_url: existing?.qr_code_data_url || qr.qr_code_data_url,
  };
}

function getMissingColumn(errorMessage: string) {
  return (
    errorMessage.match(/'([^']+)' column/)?.[1] ||
    errorMessage.match(/column "([^"]+)"/)?.[1] ||
    null
  );
}

async function saveLocationRow(
  table: ImportTable,
  row: Record<string, unknown>,
  existing: ExistingLocationClaim | null
): Promise<{ error: SaveLocationError | null; removedColumns: string[] }> {
  const rowForSave = { ...row };
  const removedColumns: string[] = [];

  for (let attempt = 0; attempt < 10; attempt++) {
    const { error } = existing?.id
      ? await supabaseAdmin.from(table).update(rowForSave).eq("id", existing.id)
      : await supabaseAdmin.from(table).insert(rowForSave);

    if (!error) return { error: null, removedColumns };

    const missingColumn = getMissingColumn(error.message);

    if (missingColumn && missingColumn in rowForSave) {
      delete rowForSave[missingColumn];
      removedColumns.push(missingColumn);
      continue;
    }

    return { error, removedColumns };
  }

  return {
    error: { message: "Unable to save import row after removing unsupported columns" },
    removedColumns,
  };
}

async function googleTextSearch(query: string) {
  const key = getGoogleKey();
  if (!key) throw new Error("Missing GOOGLE_PLACES_API_KEY or GOOGLE_MAPS_API_KEY");

  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", query);
  url.searchParams.set("key", key);

  const response = await fetch(url.toString(), { cache: "no-store" });
  const data = (await response.json()) as GoogleTextSearchResponse;

  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new Error(data.error_message || `Google Places error: ${data.status}`);
  }

  return data.results || [];
}

async function googleDetails(placeId: string) {
  const key = getGoogleKey();
  if (!key) return null;

  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set(
    "fields",
    [
      "place_id",
      "name",
      "formatted_address",
      "formatted_phone_number",
      "international_phone_number",
      "website",
      "url",
      "rating",
      "user_ratings_total",
      "business_status",
      "types",
      "photos",
      "geometry",
      "price_level",
    ].join(",")
  );
  url.searchParams.set("key", key);

  const response = await fetch(url.toString(), { cache: "no-store" });
  const data = (await response.json()) as GoogleDetailsResponse;
  return data.status === "OK" ? data.result || null : null;
}

async function upsertRestaurant(
  place: GooglePlace,
  query: string,
  options: GooglePlacesImportOptions = {}
) {
  if (!place.place_id) return { status: "skipped" as const };
  if (shouldSkipPlace(place, options)) return { status: "skipped" as const };

  const details = await googleDetails(place.place_id);
  const merged = { ...place, ...(details || {}) };
  if (shouldSkipPlace(merged, options)) return { status: "skipped" as const };

  const formattedAddress = merged.formatted_address || merged.vicinity || "";
  const addressParts = parseAddressParts(formattedAddress);
  const photoReference = merged.photos?.[0]?.photo_reference || place.photos?.[0]?.photo_reference;
  if (!hasRequiredImportFields(merged, addressParts, options)) return { status: "skipped" as const };

  const cuisine = inferCuisine(`${merged.name} ${query} ${(merged.types || []).join(" ")}`);
  if (options.requireCuisineType !== false && !cuisine.primary) return { status: "skipped" as const };
  const score = getTheOutHavenScore(merged);
  const existing = await findExistingLocation("restaurants", place.place_id);

  const row = await addClaimFields({
    restaurant_name: merged.name,
    name: merged.name,
    address: addressParts.address,
    city: addressParts.city,
    state: addressParts.state,
    zip_code: addressParts.zip_code,
    google_place_id: merged.place_id,
    latitude: merged.geometry?.location?.lat || null,
    longitude: merged.geometry?.location?.lng || null,
    rating: Number(merged.rating || 0),
    review_count: getReviewCount(merged),
    theouthaven_score: score,
    quality_score: score,
    popularity_score: Math.min(100, Math.round(Math.log10(getReviewCount(merged) + 1) * 35)),
    review_score: Number(merged.rating || 0) * 20,
    cuisine: cuisine.primary,
    food_type: cuisine.primary,
    cuisine_type: cuisine.primary,
    cuisine_tags: cuisine.tags,
    primary_tag: cuisine.primary,
    search_keywords: buildKeywords(merged, query, cuisine.tags),
    phone: merged.formatted_phone_number || merged.international_phone_number || null,
    website: merged.website || null,
    google_maps_url: merged.url || null,
    image_url: getPhotoUrl(photoReference),
    status: "approved",
  }, existing, "restaurant");

  const { error } = await saveLocationRow("restaurants", row, existing);

  if (error) return { status: "failed" as const, error: error.message };
  return { status: "imported" as const };
}

async function upsertActivity(
  place: GooglePlace,
  query: string,
  options: GooglePlacesImportOptions = {}
) {
  if (!place.place_id) return { status: "skipped" as const };
  if (shouldSkipPlace(place, options)) return { status: "skipped" as const };

  const details = await googleDetails(place.place_id);
  const merged = { ...place, ...(details || {}) };
  if (shouldSkipPlace(merged, options)) return { status: "skipped" as const };

  const formattedAddress = merged.formatted_address || merged.vicinity || "";
  const addressParts = parseAddressParts(formattedAddress);
  const photoReference = merged.photos?.[0]?.photo_reference || place.photos?.[0]?.photo_reference;
  if (!hasRequiredImportFields(merged, addressParts, options)) return { status: "skipped" as const };

  const text = `${merged.name} ${query} ${(merged.types || []).join(" ")}`;
  const activityType = inferActivityType(text);
  const score = getTheOutHavenScore(merged);
  const existing = await findExistingLocation("activities", place.place_id);

  const row = await addClaimFields({
    activity_name: merged.name,
    name: merged.name,
    address: addressParts.address,
    city: addressParts.city,
    state: addressParts.state,
    zip_code: addressParts.zip_code,
    google_place_id: merged.place_id,
    latitude: merged.geometry?.location?.lat || null,
    longitude: merged.geometry?.location?.lng || null,
    rating: Number(merged.rating || 0),
    review_count: getReviewCount(merged),
    theouthaven_score: score,
    quality_score: score,
    popularity_score: Math.min(100, Math.round(Math.log10(getReviewCount(merged) + 1) * 35)),
    review_score: Number(merged.rating || 0) * 20,
    activity_type: activityType,
    primary_tag: activityType,
    search_keywords: buildKeywords(merged, query, [activityType]),
    date_style_tags: uniqueArray([activityType, "date night", "group-friendly", "fun"]),
    atmosphere: "TheOutHaven-friendly outing, date-night, social, and group-friendly",
    phone: merged.formatted_phone_number || merged.international_phone_number || null,
    website: merged.website || null,
    google_maps_url: merged.url || null,
    image_url: getPhotoUrl(photoReference),
    status: "approved",
  }, existing, "activity");

  const { error } = await saveLocationRow("activities", row, existing);

  if (error) return { status: "failed" as const, error: error.message };
  return { status: "imported" as const };
}

function parseAreas(areas?: string | null) {
  const value = cleanText(areas || "nyc").toLowerCase();
  if (value === "nyc") return NYC_AREAS;
  if (value === "ct" || value === "connecticut") return ["Stamford", "Norwalk", "Bridgeport", "New Haven", "Hartford"];
  if (value === "nj" || value === "new_jersey" || value === "new jersey") return ["Jersey City", "Hoboken", "Newark", "Montclair", "Morristown"];
  if (value === "long_island" || value === "long island") return ["Long Island", "Nassau County", "Suffolk County", "Garden City", "Huntington"];
  if (value === "extended" || value === "all") return EXTENDED_AREAS;
  return cleanText(areas)
    .split(",")
    .map((area) => area.trim())
    .filter(Boolean);
}

function rotateQueries(queries: string[], maxQueries: number) {
  if (queries.length <= maxQueries) return queries;

  const daySeed = Math.floor(Date.now() / 86_400_000);
  const start = (daySeed * maxQueries) % queries.length;
  return Array.from({ length: maxQueries }, (_, index) => queries[(start + index) % queries.length]);
}

function filterQueries(queries: string[], batch?: string | null, maxQueries = 24) {
  const value = cleanText(batch).toLowerCase();
  if (!value || value === "all") return rotateQueries(queries, maxQueries);
  if (value === "fun") return rotateQueries(queries.filter((query) => /lounge|hookah|karaoke|arcade|bowling|escape|paint|golf|comedy|cruise|speakeasy|jazz|activity|party|interactive/.test(query)), maxQueries);
  if (value === "birthday") return rotateQueries(queries.filter((query) => /birthday|party|group|brunch|dinner|restaurant|activity|interactive/.test(query)), maxQueries);
  if (value === "romantic") return rotateQueries(queries.filter((query) => /rooftop|wine|cocktail|lounge|spa|cruise|candlelight|fine dining|tapas|jazz/.test(query)), maxQueries);
  if (value === "luxury") return rotateQueries(queries.filter((query) => /fine dining|steakhouse|seafood|wine|cocktail|rooftop|spa|lounge/.test(query)), maxQueries);
  if (value === "nightlife") return rotateQueries(queries.filter((query) => /lounge|speakeasy|cocktail|jazz|karaoke|latin|afrobeat|hookah|cigar|rooftop|club/.test(query)), maxQueries);
  if (value === "cuisine" || value === "food") return rotateQueries(CUISINE_QUERIES, maxQueries);
  return rotateQueries(queries.filter((query) => query.toLowerCase().includes(value.replace(/_/g, " "))), maxQueries);
}

async function runGroup(
  kind: "restaurant" | "activity",
  queries: string[],
  areas: string[],
  limit: number,
  seenPlaceIds: Set<string>,
  options: GooglePlacesImportOptions = {}
) {
  const stats = { checked: 0, imported: 0, skipped: 0, failed: 0, errors: [] as string[], queries_used: [] as string[] };

  for (const area of areas) {
    for (const baseQuery of queries) {
      const query = `${baseQuery} in ${area}`;
      stats.queries_used.push(query);

      try {
        const places = await googleTextSearch(query);

        for (const place of places.slice(0, limit)) {
          if (!place.place_id || seenPlaceIds.has(place.place_id)) continue;
          seenPlaceIds.add(place.place_id);
          stats.checked += 1;

          const result =
            kind === "restaurant"
              ? await upsertRestaurant(place, query, options)
              : await upsertActivity(place, query, options);
          if (result.status === "imported") stats.imported += 1;
          if (result.status === "skipped") stats.skipped += 1;
          if (result.status === "failed") {
            stats.failed += 1;
            if (result.error) stats.errors.push(`${query}: ${result.error}`);
          }

          await sleep(125);
        }
      } catch (error: unknown) {
        stats.failed += 1;
        stats.errors.push(`${query}: ${getErrorMessage(error)}`);
      }

      await sleep(200);
    }
  }

  return stats;
}

export async function runGooglePlacesImport(options: GooglePlacesImportOptions = {}) {
  const type = options.type === "all" ? "both" : options.type || "both";
  const limit = Math.max(1, Math.min(Number(options.limit || 10), 25));
  const maxQueries = Math.max(1, Math.min(Number(options.maxQueries || 2), 12));
  const areas = parseAreas(options.areas);
  const primaryTag = options.primaryTag || options.batch || "all";
  const restaurantQueries = filterQueries(CUISINE_QUERIES, primaryTag, maxQueries);
  const activityQueries = filterQueries(ACTIVITY_QUERIES, primaryTag, maxQueries);
  const seenPlaceIds = new Set<string>();

  const restaurant = type === "activities"
    ? { checked: 0, imported: 0, skipped: 0, failed: 0, errors: [] as string[], queries_used: [] as string[] }
    : await runGroup("restaurant", restaurantQueries, areas, limit, seenPlaceIds, options);

  const activity = type === "restaurants"
    ? { checked: 0, imported: 0, skipped: 0, failed: 0, errors: [] as string[], queries_used: [] as string[] }
    : await runGroup("activity", activityQueries, areas, limit, seenPlaceIds, options);

  await supabaseAdmin.from("ai_response_cache").delete().gte("created_at", "2000-01-01");

  const imported = restaurant.imported + activity.imported;
  const skipped = restaurant.skipped + activity.skipped;
  const failed = restaurant.failed + activity.failed;
  const checked = restaurant.checked + activity.checked;
  const errors = [...restaurant.errors, ...activity.errors];

  const meta = {
    type,
    limit,
    batch: primaryTag,
    primaryTag,
    minRating: Number(options.minRating || 3.8),
    requiredFields: ["photo", "phone", "website", "type", "location"],
    settings: { type, limit, batch: primaryTag, primaryTag, minRating: Number(options.minRating || 3.8), maxQueries, areas },
    maxQueries,
    areas,
    checked,
    imported,
    skipped,
    failed,
    total_found_from_google: checked,
    restaurant,
    activity,
    errors: errors.slice(0, 30),
  };

  await supabaseAdmin.from("import_logs").insert({
    job_name: "google_places_import",
    imported_count: imported,
    error: errors.length ? errors.slice(0, 5).join("; ") : null,
    meta,
  });

  return {
    success: failed === 0 || imported + skipped > 0,
    imported,
    skipped,
    failed,
    checked,
    total_found_from_google: checked,
    restaurant,
    activity,
    errors: errors.slice(0, 30),
    settings: { type, limit, batch: primaryTag, primaryTag, minRating: Number(options.minRating || 3.8), maxQueries, areas },
  };
}
