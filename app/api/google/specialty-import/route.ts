import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClaimQr } from "@/lib/claimQrServer";
import { syncActivityToLocation } from "@/lib/sync-location";
import { extractReservationUrl } from "@/lib/reservation-links";
import {
  inferMarketFromPlace,
  parseGoogleAddressComponents,
  validatePlaceForMarket,
} from "@/lib/location-market-validation";
import { requireSuperAdmin } from "@/lib/admin-api-auth";
import {
  getPlaceDetailsLegacyCompat,
  publicGooglePlacePhotoUrl,
  searchPlacesTextLegacyCompat,
  type GooglePlaceLegacyCompat as GooglePlace,
} from "@/lib/google/places-new-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
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
  hookah: ["hookah lounge", "hookah bar", "hookah cafe", "shisha lounge", "cigar lounge"],
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

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function unique(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim().toLowerCase()).filter(Boolean)));
}

function cleanAddress(address: string | null | undefined) {
  return cleanText(address)
    .replace(/,\s*USA$/i, "")
    .replace(/,\s*United States$/i, "");
}

function parseAddressParts(place: GooglePlace) {
  const parsed = parseGoogleAddressComponents(place.address_components);
  const formatted = cleanAddress(place.formatted_address || place.vicinity || "");
  const fallbackParts = formatted.split(",").map((part) => part.trim()).filter(Boolean);
  const stateZip = fallbackParts.at(-1) || "";
  const stateZipMatch = stateZip.match(/\b([A-Z]{2})\s+(\d{5})/);

  return {
    address: formatted,
    city: parsed.city || (fallbackParts.length > 2 ? fallbackParts.at(-2) || "" : ""),
    state: parsed.state || stateZipMatch?.[1] || "",
    zip_code: parsed.postalCode || stateZipMatch?.[2] || "",
    borough: parsed.borough || null,
    county: parsed.county || null,
    neighborhood: parsed.neighborhood || null,
  };
}

function inferPrimaryTag(input: string) {
  const text = input.toLowerCase();
  const rules: Array<[RegExp, string]> = [
    [/hookah|shisha/, "hookah"],
    [/cigar/, "cigar"],
    [/rooftop/, "rooftop"],
    [/speakeasy/, "speakeasy"],
    [/karaoke/, "karaoke"],
    [/bowling/, "bowling"],
    [/arcade/, "arcade"],
    [/escape/, "escape_room"],
    [/axe/, "axe_throwing"],
    [/paintball/, "paintball"],
    [/laser tag/, "laser_tag"],
    [/mini golf/, "mini_golf"],
    [/billiard|pool hall/, "billiards"],
    [/go kart/, "go_kart"],
    [/virtual reality|\bvr\b/, "vr"],
    [/paint and sip/, "paint_and_sip"],
    [/pottery/, "pottery"],
    [/candle/, "candle_making"],
    [/perfume/, "perfume_making"],
    [/cooking/, "cooking_class"],
    [/dance/, "dance_class"],
    [/art class|art studio/, "art_class"],
    [/spa|massage/, "spa"],
    [/sauna/, "sauna"],
    [/yoga/, "yoga"],
    [/comedy/, "comedy"],
    [/jazz/, "jazz"],
    [/live music/, "live_music"],
    [/museum/, "museum"],
    [/gallery/, "art_gallery"],
    [/immersive/, "immersive"],
    [/cinema|movie/, "movie"],
    [/theater|theatre/, "theater"],
    [/cruise/, "cruise"],
    [/kayak/, "kayaking"],
    [/bike/, "bike_rental"],
    [/skating/, "skating"],
    [/botanical/, "botanical_garden"],
    [/party venue/, "party_venue"],
    [/lounge/, "lounge"],
  ];
  return rules.find(([pattern]) => pattern.test(text))?.[1] || "specialty";
}

function inferActivityType(input: string) {
  const text = input.toLowerCase();
  if (/hookah|shisha|cigar|lounge|speakeasy|cocktail|afrobeat|latin/.test(text)) return "nightlife";
  if (/bowling|arcade|escape|axe|paintball|laser tag|golf|pool|billiard|go kart|virtual reality/.test(text)) return "games";
  if (/paint and sip|pottery|candle|perfume|cooking|dance|art class|diy|craft/.test(text)) return "creative";
  if (/spa|massage|wellness|sauna|float therapy|yoga|bath house/.test(text)) return "wellness";
  if (/museum|gallery|jazz|live music|theater|theatre|poetry|immersive|comedy|movie|cinema/.test(text)) return "cultural";
  if (/kayak|bike|skating|park|boardwalk|garden|outdoor|market|picnic|waterfront/.test(text)) return "outdoor";
  if (/wine|cruise|candlelight|rooftop cinema|couples/.test(text)) return "romantic";
  if (/birthday|group night|group outing|party venue/.test(text)) return "birthday";
  return "specialty";
}

function buildKeywords(place: GooglePlace, query: string, primaryTag: string, activityType: string) {
  return unique([
    cleanText(place.name),
    query,
    primaryTag,
    activityType,
    ...(place.types || []),
    "theouthaven",
    "activity",
    "date idea",
    "outing",
    "things to do",
  ]);
}

function getQueries(category: string | null, query: string | null) {
  if (query) return [query];
  if (!category || category === "all") return Object.values(SPECIALTY_QUERIES).flat();
  return SPECIALTY_QUERIES[category] || [];
}

function getAreas(areaParam: string | null, customQuery: string | null) {
  if (customQuery) return [""];
  const area = cleanText(areaParam || "Queens").toLowerCase();
  if (area === "nyc") return NYC_AREAS;
  if (area === "extended" || area === "all") return EXTENDED_AREAS;
  return areaParam
    ? areaParam.split(",").map((item) => item.trim()).filter(Boolean)
    : ["Queens"];
}

async function upsertSpecialtyActivity(
  place: GooglePlace,
  query: string,
  requestedMarket: string | null,
  requestedArea: string,
) {
  if (!place.place_id) return { status: "skipped" as const };

  const details = await getPlaceDetailsLegacyCompat(place.place_id);
  const merged = { ...place, ...details };
  if (!merged.name || merged.business_status === "CLOSED_PERMANENTLY") {
    return { status: "skipped" as const };
  }

  const rating = Number(merged.rating || 0);
  const reviews = Number(merged.user_ratings_total || 0);
  if (rating && rating < 3.8) return { status: "skipped" as const };
  if (reviews && reviews < 10) return { status: "skipped" as const };

  const parsed = parseAddressParts(merged);
  const validation = validatePlaceForMarket({
    requestedMarket:
      requestedMarket || inferMarketFromPlace({ requestedArea, query }),
    requestedArea,
    formattedAddress: merged.formatted_address || merged.vicinity || null,
    addressComponents: merged.address_components,
    city: parsed.city,
    state: parsed.state,
    county: parsed.county,
    borough: parsed.borough,
    neighborhood: parsed.neighborhood,
    postalCode: parsed.zip_code,
    latitude: merged.geometry?.location?.lat || null,
    longitude: merged.geometry?.location?.lng || null,
  });

  if (!validation.ok) {
    return {
      status: validation.reason?.includes("state")
        ? ("skipped_wrong_state" as const)
        : ("skipped_wrong_market" as const),
      validation,
    };
  }

  const text = `${merged.name} ${query} ${(merged.types || []).join(" ")}`;
  const primaryTag = inferPrimaryTag(text);
  const activityType = inferActivityType(text);
  const score = Math.max(
    50,
    Math.min(
      98,
      Math.round(rating * 14 + Math.min(25, Math.log10(reviews + 1) * 10) + (merged.photos?.length ? 6 : 0)),
    ),
  );
  const reservationUrl = extractReservationUrl(merged);
  const qr = await createClaimQr("activity");
  const placeId = merged.place_id;

  const row = {
    activity_name: merged.name,
    name: merged.name,
    address: parsed.address,
    city: parsed.city,
    state: parsed.state,
    zip_code: parsed.zip_code,
    google_place_id: placeId,
    latitude: merged.geometry?.location?.lat || null,
    longitude: merged.geometry?.location?.lng || null,
    rating,
    review_count: reviews,
    theouthaven_score: score,
    quality_score: score,
    activity_type: activityType,
    primary_tag: primaryTag,
    search_keywords: buildKeywords(merged, query, primaryTag, activityType),
    date_style_tags: unique([primaryTag, activityType, "date night", "group-friendly", "fun"]),
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
      merged.formatted_phone_number || merged.international_phone_number || null,
    website: merged.website || merged.websiteUri || null,
    google_maps_url: merged.url || merged.googleMapsUri || null,
    reservation_url: reservationUrl,
    booking_url: reservationUrl,
    image_url: placeId ? publicGooglePlacePhotoUrl(placeId) : null,
    opening_hours:
      merged.opening_hours || merged.current_opening_hours || merged.regularOpeningHours || null,
    status: "approved",
    market:
      validation.correctedMarket ||
      validation.inferredMarket ||
      requestedMarket ||
      null,
    borough: validation.borough || null,
    county: validation.county || null,
    neighborhood: validation.neighborhood || null,
    claim_status: qr.claim_status,
    claim_code: qr.claim_code,
    claim_token: qr.claim_token,
    claim_url: qr.claim_url,
    qr_link: qr.claim_url,
    claim_qr_url: qr.qr_code_data_url,
    qr_code_data_url: qr.qr_code_data_url,
    source: "google_places_new",
  };

  const { data: activity, error } = await supabaseAdmin
    .from("activities")
    .upsert(row, { onConflict: "google_place_id", ignoreDuplicates: false })
    .select("*")
    .single();

  if (error) return { status: "failed" as const, error: error.message };

  try {
    await syncActivityToLocation(
      activity as Record<string, unknown> & { id: string | number },
    );
  } catch (syncError) {
    return {
      status: "failed" as const,
      error: `Location sync failed: ${
        syncError instanceof Error ? syncError.message : String(syncError)
      }`,
    };
  }

  return { status: "imported" as const };
}

export async function GET(request: NextRequest) {
  try {
    const authError = await authorizeImport(request);
    if (authError) return authError;

    if (!process.env.GOOGLE_PLACES_API_KEY?.trim()) {
      return NextResponse.json(
        { success: false, error: "Missing GOOGLE_PLACES_API_KEY." },
        { status: 500 },
      );
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const customQuery = searchParams.get("query")?.trim() || null;
    const areaParam = searchParams.get("area");
    const requestedMarket =
      searchParams.get("market") || searchParams.get("requestedMarket") || null;
    const limit = Math.min(Math.max(Number(searchParams.get("limit") || 10), 1), 20);

    const queries = getQueries(category, customQuery);
    const areas = getAreas(areaParam, customQuery);

    if (!queries.length) {
      return NextResponse.json(
        {
          error:
            "Invalid category. Use hookah, nightlife, games, creative, wellness, culture, romantic, outdoor, birthday, all, or pass a custom query.",
        },
        { status: 400 },
      );
    }

    const stats = {
      checked: 0,
      imported: 0,
      skipped: 0,
      failed: 0,
      skipped_duplicate: 0,
      skipped_wrong_state: 0,
      skipped_wrong_market: 0,
      skipped_out_of_area: 0,
      rejected_examples: [] as Record<string, unknown>[],
      queries_used: [] as string[],
      requested_market:
        requestedMarket || inferMarketFromPlace({ requestedArea: areaParam || undefined }),
      inferred_market_counts: {} as Record<string, number>,
      state_counts: {} as Record<string, number>,
      market_mismatch_count: 0,
      errors: [] as string[],
    };

    const seenPlaceIds = new Set<string>();

    for (const area of areas) {
      for (const baseQuery of queries) {
        const finalQuery = customQuery ? customQuery : `${baseQuery} in ${area}`;
        stats.queries_used.push(finalQuery);

        try {
          const places = await searchPlacesTextLegacyCompat(finalQuery);

          for (const place of places.slice(0, limit)) {
            if (!place.place_id) continue;
            if (seenPlaceIds.has(place.place_id)) {
              stats.skipped_duplicate += 1;
              continue;
            }

            seenPlaceIds.add(place.place_id);
            stats.checked += 1;
            const result = await upsertSpecialtyActivity(
              place,
              finalQuery,
              requestedMarket,
              area,
            );

            if (result.status === "imported") stats.imported += 1;
            else if (result.status === "skipped") stats.skipped += 1;
            else if (
              result.status === "skipped_wrong_state" ||
              result.status === "skipped_wrong_market"
            ) {
              stats.skipped += 1;
              if (result.status === "skipped_wrong_state") {
                stats.skipped_wrong_state += 1;
              } else {
                stats.skipped_wrong_market += 1;
              }
              const validation = result.validation;
              if (validation) {
                const inferred = String(validation.inferredMarket || "UNKNOWN");
                stats.inferred_market_counts[inferred] =
                  (stats.inferred_market_counts[inferred] || 0) + 1;
                if (validation.state) {
                  stats.state_counts[validation.state] =
                    (stats.state_counts[validation.state] || 0) + 1;
                }
                if (stats.rejected_examples.length < 10) {
                  stats.rejected_examples.push({
                    name: place.name,
                    address: place.formatted_address || place.vicinity,
                    requestedMarket: validation.requestedMarket,
                    detectedState: validation.state,
                    detectedCity: validation.city,
                    reason: validation.reason,
                  });
                }
              }
            } else if (result.status === "failed") {
              stats.failed += 1;
              if (result.error) stats.errors.push(result.error);
            }
          }
        } catch (error) {
          stats.failed += 1;
          stats.errors.push(
            `${finalQuery}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    stats.market_mismatch_count = stats.skipped_wrong_market;

    await supabaseAdmin
      .from("ai_response_cache")
      .delete()
      .gte("created_at", "2000-01-01");

    await supabaseAdmin.from("import_logs").insert({
      job_name: "manual_specialty_activity_import_new",
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
        "Manual specialty import complete using Google Places API (New). This route only runs when you call it directly.",
      settings: {
        category: category || "custom",
        query: customQuery,
        area: areaParam || "Queens",
        areas,
        limit,
      },
      stats,
    });
  } catch (error) {
    console.error("MANUAL SPECIALTY IMPORT ERROR:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Manual specialty import failed",
      },
      { status: 500 },
    );
  }
}
