import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClaimQr } from "@/lib/claimQrServer";
import { syncActivityToLocation } from "@/lib/sync-location";
import { extractReservationUrl } from "@/lib/reservation-links";
import { inferMarketFromPlace, parseGoogleAddressComponents, validatePlaceForMarket } from "@/lib/location-market-validation";
import { requireSuperAdmin } from "@/lib/admin-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
];

const SPECIALTY_QUERIES: Record<string, string[]> = {
  hookah: [
    "hookah lounge",
    "hookah bar",
    "hookah cafe",
    "shisha lounge",
    "cigar lounge",
  ],
  nightlife: [
    "rooftop lounge",
    "speakeasy",
    "cocktail lounge",
    "jazz lounge",
    "live music lounge",
    "karaoke lounge",
    "latin lounge",
    "afrobeat lounge",
    "late night lounge",
  ],
  games: [
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
  ],
  creative: [
    "paint and sip",
    "pottery class",
    "candle making",
    "candle making class",
    "perfume making",
    "perfume making experience",
    "cooking class",
    "sushi making class",
    "dance class",
    "art class",
    "diy workshop",
  ],
  wellness: [
    "couples spa",
    "spa",
    "massage spa",
    "sauna",
    "wellness lounge",
    "float therapy",
    "yoga studio",
    "bath house",
  ],
  culture: [
    "museum",
    "art gallery",
    "immersive experience",
    "immersive exhibit",
    "jazz club",
    "poetry lounge",
    "indie movie theater",
    "live theater",
    "comedy club",
    "live music venue",
  ],
  romantic: [
    "wine tasting",
    "rooftop cinema",
    "dinner cruise",
    "sunset cruise",
    "candlelight concert",
    "romantic rooftop experience",
    "couples experience",
  ],
  outdoor: [
    "kayaking",
    "bike rental",
    "skating rink",
    "outdoor movie",
    "holiday market",
    "botanical garden",
    "picnic spot",
    "waterfront activity",
  ],
  birthday: [
    "birthday activity",
    "group outing",
    "group night activity",
    "double date activity",
    "fun date night",
    "interactive experience",
    "party venue",
  ],
};

async function authorizeImport(request: NextRequest) {
  const importSecret = process.env.IMPORT_SECRET;
  const cronSecret = process.env.CRON_SECRET;

  const internalSecret = request.headers.get("x-internal-import-secret");
  const authorization = request.headers.get("authorization");

  if (importSecret && internalSecret === importSecret) return null;

  if (
    cronSecret &&
    authorization?.toLowerCase().startsWith("bearer ") &&
    authorization.replace(/^Bearer\s+/i, "") === cronSecret
  ) {
    return null;
  }

  const { error } = await requireSuperAdmin();
  return error;
}

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

function cleanText(value: any) {
  return String(value || "").trim();
}

function normalizeText(value: any) {
  return String(value || "").toLowerCase();
}

function uniqueArray(items: string[]) {
  return Array.from(
    new Set(
      items
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    )
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

function getReviewCount(place: any) {
  return Number(place.user_ratings_total || place.review_count || 0);
}

function getPhotoUrl(photoReference?: string | null) {
  const key = getGoogleKey();
  if (!key || !photoReference) return null;

  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${photoReference}&key=${key}`;
}

function inferPrimaryTag(textInput: string) {
  const text = normalizeText(textInput);

  if (text.includes("hookah") || text.includes("shisha")) return "hookah";
  if (text.includes("cigar")) return "cigar";
  if (text.includes("rooftop")) return "rooftop";
  if (text.includes("speakeasy")) return "speakeasy";
  if (text.includes("karaoke")) return "karaoke";
  if (text.includes("bowling")) return "bowling";
  if (text.includes("arcade")) return "arcade";
  if (text.includes("escape")) return "escape_room";
  if (text.includes("axe")) return "axe_throwing";
  if (text.includes("paintball")) return "paintball";
  if (text.includes("laser tag")) return "laser_tag";
  if (text.includes("mini golf")) return "mini_golf";
  if (text.includes("golf")) return "golf";
  if (text.includes("go kart")) return "go_kart";
  if (text.includes("virtual reality") || text.includes("vr ")) return "vr";
  if (text.includes("paint and sip")) return "paint_and_sip";
  if (text.includes("pottery")) return "pottery";
  if (text.includes("candle")) return "candle_making";
  if (text.includes("perfume")) return "perfume_making";
  if (text.includes("cooking")) return "cooking_class";
  if (text.includes("sushi making")) return "sushi_making";
  if (text.includes("dance")) return "dance_class";
  if (text.includes("spa") || text.includes("massage")) return "spa";
  if (text.includes("sauna")) return "sauna";
  if (text.includes("yoga")) return "yoga";
  if (text.includes("comedy")) return "comedy";
  if (text.includes("jazz")) return "jazz";
  if (text.includes("live music")) return "live_music";
  if (text.includes("museum")) return "museum";
  if (text.includes("gallery")) return "art_gallery";
  if (text.includes("immersive")) return "immersive";
  if (text.includes("cinema") || text.includes("movie")) return "movie";
  if (text.includes("theater")) return "theater";
  if (text.includes("poetry")) return "poetry";
  if (text.includes("cruise")) return "cruise";
  if (text.includes("kayak")) return "kayaking";
  if (text.includes("bike")) return "bike_rental";
  if (text.includes("skating")) return "skating";
  if (text.includes("botanical")) return "botanical_garden";
  if (text.includes("holiday market")) return "holiday_market";
  if (text.includes("picnic")) return "picnic";
  if (text.includes("party venue")) return "party_venue";
  if (text.includes("lounge")) return "lounge";

  return "specialty";
}

function inferActivityType(textInput: string) {
  const text = normalizeText(textInput);

  if (
    text.includes("hookah") ||
    text.includes("shisha") ||
    text.includes("cigar") ||
    text.includes("lounge") ||
    text.includes("speakeasy") ||
    text.includes("cocktail") ||
    text.includes("afrobeat") ||
    text.includes("latin")
  ) {
    return "nightlife";
  }

  if (
    text.includes("bowling") ||
    text.includes("arcade") ||
    text.includes("escape") ||
    text.includes("axe") ||
    text.includes("paintball") ||
    text.includes("laser tag") ||
    text.includes("mini golf") ||
    text.includes("golf") ||
    text.includes("pool") ||
    text.includes("billiards") ||
    text.includes("go kart") ||
    text.includes("virtual reality") ||
    text.includes("vr ")
  ) {
    return "games";
  }

  if (
    text.includes("paint and sip") ||
    text.includes("pottery") ||
    text.includes("candle") ||
    text.includes("perfume") ||
    text.includes("cooking") ||
    text.includes("dance") ||
    text.includes("art class") ||
    text.includes("diy")
  ) {
    return "creative";
  }

  if (
    text.includes("spa") ||
    text.includes("massage") ||
    text.includes("wellness") ||
    text.includes("sauna") ||
    text.includes("float therapy") ||
    text.includes("yoga") ||
    text.includes("bath house")
  ) {
    return "wellness";
  }

  if (
    text.includes("museum") ||
    text.includes("gallery") ||
    text.includes("jazz") ||
    text.includes("live music") ||
    text.includes("theater") ||
    text.includes("poetry") ||
    text.includes("immersive") ||
    text.includes("comedy") ||
    text.includes("movie") ||
    text.includes("cinema")
  ) {
    return "cultural";
  }

  if (
    text.includes("kayak") ||
    text.includes("bike") ||
    text.includes("skating") ||
    text.includes("garden") ||
    text.includes("outdoor") ||
    text.includes("market") ||
    text.includes("picnic") ||
    text.includes("waterfront")
  ) {
    return "outdoor";
  }

  if (
    text.includes("wine") ||
    text.includes("cruise") ||
    text.includes("candlelight") ||
    text.includes("rooftop cinema") ||
    text.includes("couples")
  ) {
    return "romantic";
  }

  if (
    text.includes("birthday") ||
    text.includes("group night") ||
    text.includes("group outing") ||
    text.includes("party venue")
  ) {
    return "birthday";
  }

  return "specialty";
}

function buildSearchKeywords(place: any, query: string) {
  const text = normalizeText(`${place.name} ${query} ${(place.types || []).join(" ")}`);

  const keywords = [
    "theouthaven",
    "activity",
    "specialty activity",
    "date idea",
    "outing",
    "things to do",
  ];

  if (text.includes("hookah") || text.includes("shisha")) {
    keywords.push(
      "hookah",
      "hookah lounge",
      "shisha",
      "nightlife",
      "late night",
      "lounge",
      "birthday",
      "date night",
      "group outing"
    );
  }

  if (text.includes("cigar")) keywords.push("cigar", "cigar lounge", "nightlife");
  if (text.includes("rooftop")) keywords.push("rooftop", "views", "skyline", "luxury");
  if (text.includes("speakeasy")) keywords.push("speakeasy", "cocktails", "date night");
  if (text.includes("karaoke")) keywords.push("karaoke", "singing", "group outing");
  if (text.includes("latin")) keywords.push("latin", "music", "nightlife");
  if (text.includes("afrobeat")) keywords.push("afrobeat", "music", "nightlife");
  if (text.includes("bowling")) keywords.push("bowling", "games", "fun");
  if (text.includes("arcade")) keywords.push("arcade", "games", "interactive");
  if (text.includes("escape")) keywords.push("escape room", "interactive", "group outing");
  if (text.includes("axe")) keywords.push("axe throwing", "competitive");
  if (text.includes("paintball")) keywords.push("paintball", "competitive");
  if (text.includes("laser tag")) keywords.push("laser tag", "games", "competitive");
  if (text.includes("mini golf")) keywords.push("mini golf", "date night", "games");
  if (text.includes("go kart")) keywords.push("go kart", "racing", "fun");
  if (text.includes("virtual reality") || text.includes("vr ")) keywords.push("vr", "virtual reality", "immersive");
  if (text.includes("paint and sip")) keywords.push("paint and sip", "creative", "group night");
  if (text.includes("pottery")) keywords.push("pottery", "creative");
  if (text.includes("candle")) keywords.push("candle making", "creative");
  if (text.includes("perfume")) keywords.push("perfume making", "creative");
  if (text.includes("cooking")) keywords.push("cooking class", "food experience");
  if (text.includes("dance")) keywords.push("dance class", "couples", "creative");
  if (text.includes("spa") || text.includes("massage")) keywords.push("spa", "wellness", "couples");
  if (text.includes("sauna")) keywords.push("sauna", "wellness", "relaxing");
  if (text.includes("yoga")) keywords.push("yoga", "wellness", "relaxing");
  if (text.includes("jazz")) keywords.push("jazz", "live music", "romantic");
  if (text.includes("comedy")) keywords.push("comedy", "fun", "date night");
  if (text.includes("museum")) keywords.push("museum", "culture");
  if (text.includes("gallery")) keywords.push("art gallery", "culture");
  if (text.includes("immersive")) keywords.push("immersive", "unique");
  if (text.includes("movie") || text.includes("cinema")) keywords.push("movie", "cinema", "date night");
  if (text.includes("theater")) keywords.push("theater", "show", "culture");
  if (text.includes("poetry")) keywords.push("poetry", "culture", "spoken word");
  if (text.includes("cruise")) keywords.push("cruise", "romantic", "luxury");
  if (text.includes("kayak")) keywords.push("kayaking", "outdoor", "waterfront");
  if (text.includes("bike")) keywords.push("bike rental", "outdoor");
  if (text.includes("skating")) keywords.push("skating", "outdoor", "date night");
  if (text.includes("holiday market")) keywords.push("holiday market", "seasonal");
  if (text.includes("botanical")) keywords.push("botanical garden", "outdoor", "romantic");
  if (text.includes("picnic")) keywords.push("picnic", "outdoor", "romantic");
  if (text.includes("party venue")) keywords.push("party venue", "birthday", "group outing");

  return uniqueArray(keywords);
}

function buildDateStyleTags(place: any, query: string) {
  const text = normalizeText(`${place.name} ${query}`);
  const tags: string[] = ["date-night", "outing"];

  if (text.includes("hookah") || text.includes("shisha")) {
    tags.push("nightlife", "late-night", "social", "group-friendly", "birthday");
  }

  if (text.includes("lounge") || text.includes("speakeasy") || text.includes("cocktail")) {
    tags.push("nightlife", "upscale", "social");
  }

  if (text.includes("rooftop")) tags.push("romantic", "scenic", "upscale");

  if (
    text.includes("bowling") ||
    text.includes("arcade") ||
    text.includes("escape") ||
    text.includes("axe") ||
    text.includes("paintball") ||
    text.includes("laser tag") ||
    text.includes("mini golf") ||
    text.includes("go kart") ||
    text.includes("virtual reality")
  ) {
    tags.push("fun", "interactive", "group-friendly");
  }

  if (
    text.includes("paint and sip") ||
    text.includes("pottery") ||
    text.includes("candle") ||
    text.includes("perfume") ||
    text.includes("cooking") ||
    text.includes("dance")
  ) {
    tags.push("creative", "group-night", "interactive");
  }

  if (
    text.includes("spa") ||
    text.includes("massage") ||
    text.includes("sauna") ||
    text.includes("wellness") ||
    text.includes("yoga")
  ) {
    tags.push("romantic", "relaxing", "wellness", "couples");
  }

  if (
    text.includes("museum") ||
    text.includes("gallery") ||
    text.includes("jazz") ||
    text.includes("live music") ||
    text.includes("comedy") ||
    text.includes("immersive") ||
    text.includes("theater")
  ) {
    tags.push("cultural", "romantic", "unique");
  }

  if (
    text.includes("birthday") ||
    text.includes("group night") ||
    text.includes("group outing") ||
    text.includes("party")
  ) {
    tags.push("birthday", "group-friendly", "social");
  }

  return uniqueArray(tags);
}

function getTheOutHavenScore(place: any) {
  const rating = Number(place.rating || 0);
  const reviews = getReviewCount(place);

  const ratingScore = rating ? rating * 18 : 45;
  const reviewScore = reviews ? Math.min(30, Math.log10(reviews + 1) * 12) : 0;
  const photoScore = place.photos?.length ? 10 : 0;
  const openScore = place.business_status === "OPERATIONAL" ? 10 : 0;

  return Math.min(100, Math.round(ratingScore + reviewScore + photoScore + openScore));
}

function shouldSkipPlace(place: any) {
  const rating = Number(place.rating || 0);
  const reviews = getReviewCount(place);

  if (!place.place_id || !place.name) return true;
  if (place.business_status && place.business_status !== "OPERATIONAL") return true;
  if (rating && rating < 3.8) return true;
  if (reviews && reviews < 10) return true;

  return false;
}

async function googleTextSearch(query: string) {
  const key = getGoogleKey();

  if (!key) {
    throw new Error("Missing GOOGLE_PLACES_API_KEY or GOOGLE_MAPS_API_KEY");
  }

  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", query);
  url.searchParams.set("key", key);

  const response = await fetch(url.toString(), {
    cache: "no-store",
  });

  const data = await response.json();

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
      "address_components",
      "price_level",
    ].join(",")
  );
  url.searchParams.set("key", key);

  const response = await fetch(url.toString(), {
    cache: "no-store",
  });

  const data = await response.json();

  if (data.status !== "OK") return null;

  return data.result;
}

async function upsertSpecialtyActivity(place: any, query: string, requestedMarket?: string | null, requestedArea?: string | null) {
  const details = await googleDetails(place.place_id);

  const merged = {
    ...place,
    ...(details || {}),
  };

  if (shouldSkipPlace(merged)) {
    return { status: "skipped" as const };
  }

  const formattedAddress =
    merged.formatted_address ||
    merged.vicinity ||
    place.formatted_address ||
    place.vicinity ||
    "";

  const addressParts = parseAddressParts(formattedAddress);
  const parsed = parseGoogleAddressComponents(merged.address_components);
  const marketValidation = validatePlaceForMarket({ requestedMarket: requestedMarket || inferMarketFromPlace({ requestedArea, query }), requestedArea, formattedAddress, addressComponents: merged.address_components, city: parsed.city, state: parsed.state, county: parsed.county, borough: parsed.borough, neighborhood: parsed.neighborhood, latitude: merged.geometry?.location?.lat || null, longitude: merged.geometry?.location?.lng || null });
  if (!marketValidation.ok) return { status: marketValidation.reason?.includes("state") ? "skipped_wrong_state" as const : "skipped_wrong_market" as const, validation: marketValidation };
  const photoReference =
    merged.photos?.[0]?.photo_reference || place.photos?.[0]?.photo_reference;
  const imageUrl = getPhotoUrl(photoReference);

  const text = `${merged.name} ${query} ${(merged.types || []).join(" ")}`;
  const primaryTag = inferPrimaryTag(text);
  const activityType = inferActivityType(text);
  const score = getTheOutHavenScore(merged);
  const reservationUrl = extractReservationUrl(merged);
  const website = merged.website || merged.websiteUri || null;
  const googleMapsUrl = merged.url || merged.googleMapsUri || null;
  const qr = await createClaimQr("activity");

  const row = {
    activity_name: merged.name,
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
    popularity_score: Math.min(
      100,
      Math.round(Math.log10(getReviewCount(merged) + 1) * 35)
    ),
    review_score: Number(merged.rating || 0) * 20,

    activity_type: activityType,
    primary_tag: primaryTag,
    search_keywords: buildSearchKeywords(merged, query),
    date_style_tags: buildDateStyleTags(merged, query),

    atmosphere:
      activityType === "nightlife"
        ? "Nightlife, social, late-night"
        : activityType === "wellness"
        ? "Relaxed, calm, wellness"
        : activityType === "games"
        ? "Fun, interactive, group-friendly"
        : activityType === "creative"
        ? "Creative, hands-on, social"
        : activityType === "romantic"
        ? "Romantic, elevated, date-night friendly"
        : activityType === "outdoor"
        ? "Outdoor, scenic, active"
        : activityType === "birthday"
        ? "Birthday-friendly, social, group-focused"
        : "Specialty experience",

    phone:
      merged.formatted_phone_number ||
      merged.international_phone_number ||
      null,
    website,
    google_maps_url: googleMapsUrl,
    reservation_url: reservationUrl,
    booking_url: reservationUrl,
    image_url: imageUrl,

    status: "approved",
    market: marketValidation.correctedMarket || marketValidation.inferredMarket || requestedMarket || null,
    borough: marketValidation.borough || null,
    county: marketValidation.county || null,
    neighborhood: marketValidation.neighborhood || null,
    claim_status: qr.claim_status,
    claim_token: qr.claim_token,
    claim_url: qr.claim_url,
    qr_code_data_url: qr.qr_code_data_url,
  };

  const { data: activity, error } = await supabaseAdmin
    .from("activities")
    .upsert(row, {
      onConflict: "google_place_id",
      ignoreDuplicates: false,
    })
    .select("*")
    .single();

  if (error) {
    console.error("SPECIALTY ACTIVITY UPSERT ERROR:", error);
    return { status: "failed" as const, error: error.message };
  }

  try {
    await syncActivityToLocation(
      activity as Record<string, unknown> & { id: string | number },
    );
  } catch (syncError) {
    const message =
      syncError instanceof Error ? syncError.message : String(syncError);
    console.error("SPECIALTY LOCATION SYNC ERROR:", syncError);
    return { status: "failed" as const, error: `Location sync failed: ${message}` };
  }

  return { status: "imported" as const };
}

function getQueries(category: string | null, query: string | null) {
  if (query) return [query];

  if (!category || category === "all") {
    return Object.values(SPECIALTY_QUERIES).flat();
  }

  return SPECIALTY_QUERIES[category] || [];
}

function getAreas(areaParam: string | null, customQuery: string | null) {
  if (customQuery) return [""];

  const area = cleanText(areaParam || "Queens").toLowerCase();

  if (area === "nyc") return NYC_AREAS;
  if (area === "extended" || area === "all") return EXTENDED_AREAS;

  return areaParam
    ? areaParam
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : ["Queens"];
}

export async function GET(request: NextRequest) {
  try {
    const authError = await authorizeImport(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);

    const category = searchParams.get("category");
    const customQuery = searchParams.get("query")?.trim() || null;
    const areaParam = searchParams.get("area");
    const requestedMarket = searchParams.get("market") || searchParams.get("requestedMarket") || null;
    const limit = Math.min(Number(searchParams.get("limit") || 10), 25);

    const queries = getQueries(category, customQuery);
    const areas = getAreas(areaParam, customQuery);

    if (!queries.length) {
      return NextResponse.json(
        {
          error:
            "Invalid category. Use hookah, nightlife, games, creative, wellness, culture, romantic, outdoor, birthday, all, or pass a custom query.",
        },
        { status: 400 }
      );
    }

    const stats = {
      checked: 0,
      imported: 0,
      skipped: 0,
      failed: 0,
      skipped_duplicate: 0, skipped_wrong_state: 0, skipped_wrong_market: 0, skipped_out_of_area: 0, rejected_examples: [] as any[], queries_used: [] as string[], requested_market: requestedMarket || inferMarketFromPlace({ requestedArea: areaParam || undefined }), inferred_market_counts: {} as Record<string, number>, state_counts: {} as Record<string, number>, market_mismatch_count: 0, errors: [] as string[],
    };

    const seenPlaceIds = new Set<string>();

    for (const area of areas) {
      for (const baseQuery of queries) {
        const finalQuery = customQuery ? customQuery : `${baseQuery} in ${area}`;
        stats.queries_used.push(finalQuery);

        try {
          const places = await googleTextSearch(finalQuery);

          for (const place of places.slice(0, limit)) {
            if (seenPlaceIds.has(place.place_id)) { stats.skipped_duplicate += 1; continue; }

            seenPlaceIds.add(place.place_id);
            stats.checked += 1;

            const result = await upsertSpecialtyActivity(place, finalQuery, requestedMarket, area);

            if (result.status === "imported") stats.imported += 1;
            if (result.status === "skipped") stats.skipped += 1;
            if (result.status === "skipped_wrong_state" || result.status === "skipped_wrong_market") { stats.skipped += 1; if (result.status === "skipped_wrong_state") stats.skipped_wrong_state += 1; else { stats.skipped_wrong_market += 1; stats.market_mismatch_count = stats.skipped_wrong_market; } const v = result.validation; if (v) { stats.inferred_market_counts[v.inferredMarket] = (stats.inferred_market_counts[v.inferredMarket] || 0) + 1; if (v.state) stats.state_counts[v.state] = (stats.state_counts[v.state] || 0) + 1; if (stats.rejected_examples.length < 10) stats.rejected_examples.push({ name: place.name, address: place.formatted_address || place.vicinity, requestedMarket: v.requestedMarket, detectedState: v.state, detectedCity: v.city, reason: v.reason }); } }

            if (result.status === "failed") {
              stats.failed += 1;
              if (result.error) stats.errors.push(result.error);
            }

            await sleep(150);
          }
        } catch (error: any) {
          stats.failed += 1;
          stats.errors.push(`${finalQuery}: ${error.message}`);
        }

        await sleep(250);
      }
    }

    stats.market_mismatch_count = stats.skipped_wrong_market;

    // Clear AI cache after imports
await supabaseAdmin
  .from("ai_response_cache")
  .delete()
  .gte("created_at", "2000-01-01");

    await supabaseAdmin.from("import_logs").insert({
      job_name: "manual_specialty_activity_import",
      imported_count: stats.imported,
      meta: {
        category: category || "custom",
        query: customQuery,
        area: areaParam || "Queens",
        areas,
        limit,
        checked: stats.checked,
        skipped: stats.skipped,
        failed: stats.failed,
        errors: stats.errors.slice(0, 20),
      },
    });

    return NextResponse.json({
      success: true,
      message:
        "Manual specialty import complete. This route only runs when you call it directly.",
      settings: {
        category: category || "custom",
        query: customQuery,
        area: areaParam || "Queens",
        areas,
        limit,
      },
      stats,
    });
  } catch (error: any) {
    console.error("MANUAL SPECIALTY IMPORT ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Manual specialty import failed",
      },
      { status: 500 }
    );
  }
}