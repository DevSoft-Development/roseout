import { handleGeneratePost } from "@/lib/search/public-api/controller";
import { mobileJson, mobileError } from "../_lib/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GUIDED_FLOW_VERSION = "guided_create_v1";
const WEB_TIMEZONE = "America/New_York";

type MobileSearchBody = {
  query?: string;
  planType?: "outing" | "restaurant" | "activity";
  when?: string;
  customDate?: string;
  customTime?: string;
  area?: string;
  partySize?: number | string;
  budget?: string;
  travel?: string;
  preferences?: string[];
  customMatters?: string[];
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function list(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter(
          (item): item is string =>
            typeof item === "string" && Boolean(item.trim()),
        )
        .map((item) => item.trim())
    : [];
}

function laneFor(planType: MobileSearchBody["planType"]) {
  return planType === "restaurant"
    ? "restaurant"
    : planType === "activity"
      ? "activity"
      : "mixed";
}

// Keep this intentionally identical to the web guided create flow's buildPrompt().
// Mobile supplies the same structured choices, while the server converts them into
// the exact prompt the web client sends to /api/generate.
function buildWebGuidedPrompt(body: MobileSearchBody) {
  const query = text(body.query);
  if (!query) return "";

  const typeInstruction =
    body.planType === "restaurant"
      ? "restaurant only"
      : body.planType === "activity"
        ? "activity only"
        : "restaurant and activity outing";
  const timing = [
    text(body.customDate) ||
      (text(body.when) && text(body.when) !== "none" ? text(body.when) : null),
    text(body.customTime) || null,
  ]
    .filter(Boolean)
    .join(" ");
  const allMatters = [...list(body.preferences), ...list(body.customMatters)];

  return [
    `Plan a ${typeInstruction}.`,
    query,
    `Location: ${text(body.area) || "near me"}.`,
    timing ? `When: ${timing}.` : "",
    allMatters.length ? `Preferences: ${allMatters.join(", ")}.` : "",
    "Return the best options, ranked by fit.",
  ]
    .filter(Boolean)
    .join(" ");
}

function pickName(value: any) {
  return String(
    value?.name ||
      value?.restaurant_name ||
      value?.activity_name ||
      "TheOutHaven location",
  );
}

function pickCategory(value: any) {
  return String(
    value?.category ||
      value?.primary_category ||
      value?.cuisine ||
      value?.activity_type ||
      value?.location_type ||
      "",
  );
}

function pickImage(value: any) {
  const photos = Array.isArray(value?.photos) ? value.photos : [];
  const firstPhoto = photos.find(
    (item: unknown) => typeof item === "string" && item.trim(),
  );
  const image =
    value?.image_url ||
    value?.main_image ||
    value?.image ||
    value?.photo_url ||
    value?.photo ||
    firstPhoto;
  return typeof image === "string" && image.trim() ? image.trim() : null;
}

function shapePlace(value: any, kind: "restaurant" | "activity") {
  const id = String(value?.id || value?.location_id || value?.source_id || "");
  return {
    id,
    name: pickName(value),
    kind,
    category: pickCategory(value),
    imageUrl: pickImage(value),
    rating: numberOrNull(
      value?.rating ?? value?.google_rating ?? value?.average_rating,
    ),
    reviewCount: numberOrNull(
      value?.review_count ??
        value?.user_ratings_total ??
        value?.google_review_count,
    ),
    priceLevel: firstText(value?.price_level, value?.price_range, value?.price),
    distanceMiles: numberOrNull(
      value?.distance_miles ?? value?.distanceMiles,
    ),
    whyMatched: firstText(
      value?.whyMatched,
      value?.why_it_matched,
      Array.isArray(value?.matchReasons) ? value.matchReasons[0] : null,
    ),
    publicUrl: firstText(
      value?.public_url,
      value?.detail_url,
      value?.profile_href,
    ),
    reservationUrl: firstText(
      value?.reservation_url,
      value?.booking_url,
      value?.reservation_link,
      value?.external_reservation_url,
    ),
    websiteUrl: firstText(
      value?.website,
      value?.website_url,
      value?.official_website,
    ),
    phone: firstText(
      value?.phone,
      value?.phone_number,
      value?.formatted_phone,
    ),
    address: firstText(
      value?.formatted_address,
      value?.full_address,
      value?.address,
    ),
    latitude: numberOrNull(value?.latitude ?? value?.lat),
    longitude: numberOrNull(value?.longitude ?? value?.lng ?? value?.lon),
  };
}

function shapePair(
  value: any,
  index: number,
  resultType: "pair" | "same_venue" = "pair",
) {
  const restaurant =
    value?.restaurant ||
    value?.restaurant_location ||
    value?.restaurantLocation ||
    (resultType === "same_venue" ? value : null);
  const activity =
    value?.activity ||
    value?.activity_location ||
    value?.activityLocation ||
    (resultType === "same_venue" ? value : null);
  return {
    id: String(value?.id || value?.pair_id || `${resultType}-${index}`),
    restaurant: restaurant ? shapePlace(restaurant, "restaurant") : null,
    activity: activity ? shapePlace(activity, "activity") : null,
    distanceMiles:
      resultType === "same_venue"
        ? 0
        : numberOrNull(value?.distance_miles ?? value?.distanceMiles),
    walkMinutes:
      resultType === "same_venue"
        ? 0
        : numberOrNull(
            value?.walk_minutes ??
              value?.walkingMinutes ??
              value?.walkMinutes,
          ),
    reason: firstText(
      value?.reason,
      value?.pairing_reason,
      value?.whyMatched,
      value?.why_it_matched,
    ),
    resultType,
  };
}

export async function POST(request: Request) {
  let body: MobileSearchBody;
  try {
    body = (await request.json()) as MobileSearchBody;
  } catch {
    return mobileError(
      "INVALID_JSON",
      "Search request was not valid JSON.",
      400,
    );
  }

  const prompt = buildWebGuidedPrompt(body);
  if (!prompt)
    return mobileError(
      "QUERY_REQUIRED",
      "Tell TheOutHaven what you want to do.",
      400,
    );

  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");

  const guestId = headers.get("x-theouthaven-guest-id")?.trim();
  if (guestId && !headers.get("cookie")) {
    headers.set("cookie", `guest_search_id=${encodeURIComponent(guestId)}`);
  }

  // This request body intentionally matches GuidedResultsPageV4. The mobile
  // endpoint is now only an authenticated compatibility/rendering adapter; all
  // parsing, geo resolution, retrieval, ranking, pairing, and enrichment happen
  // in the exact same public search controller used by the web create flow.
  const canonicalRequest = new Request(request.url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      input: prompt,
      selectedSearchLane: laneFor(body.planType),
      timezone: WEB_TIMEZONE,
      useCurrentLocation: false,
      guidedFlow: GUIDED_FLOW_VERSION,
    }),
  });

  const canonicalResponse = await handleGeneratePost(canonicalRequest);
  let payload: any = null;
  try {
    payload = await canonicalResponse.clone().json();
  } catch {
    return mobileError(
      "SEARCH_FAILED",
      "TheOutHaven could not complete that search.",
      canonicalResponse.status || 500,
    );
  }

  if (!canonicalResponse.ok) {
    const code = payload?.error?.code || payload?.code || "SEARCH_FAILED";
    const messageText =
      payload?.error?.message ||
      payload?.message ||
      "TheOutHaven could not complete that search.";
    return mobileError(String(code), String(messageText), canonicalResponse.status);
  }

  const source = payload?.searchV2 || payload;
  const restaurantsRaw = Array.isArray(source?.restaurants)
    ? source.restaurants
    : Array.isArray(payload?.restaurants)
      ? payload.restaurants
      : [];
  const activitiesRaw = Array.isArray(source?.activities)
    ? source.activities
    : Array.isArray(payload?.activities)
      ? payload.activities
      : [];
  const pairsRaw = Array.isArray(source?.pairs)
    ? source.pairs
    : Array.isArray(payload?.pairs)
      ? payload.pairs
      : [];
  const sameVenueRaw = Array.isArray(source?.sameVenueResults)
    ? source.sameVenueResults
    : Array.isArray(source?.same_venue_results)
      ? source.same_venue_results
      : Array.isArray(payload?.sameVenueResults)
        ? payload.sameVenueResults
        : Array.isArray(payload?.same_venue_results)
          ? payload.same_venue_results
          : [];

  const restaurants = restaurantsRaw.map((item: any) =>
    shapePlace(item, "restaurant"),
  );
  const activities = activitiesRaw.map((item: any) =>
    shapePlace(item, "activity"),
  );
  const pairs = pairsRaw.map((item: any, index: number) =>
    shapePair(item, index),
  );
  const sameVenueResults = sameVenueRaw.map((item: any, index: number) =>
    shapePair(item, index, "same_venue"),
  );

  return mobileJson({
    ok: true,
    requestId: payload?.request_id || payload?.requestId || null,
    reply: typeof payload?.reply === "string" ? payload.reply : null,
    renderMode:
      payload?.render_mode ||
      payload?.renderMode ||
      (pairs.length || sameVenueResults.length ? "outings" : "places"),
    pairs,
    sameVenueResults,
    restaurants,
    activities,
  });
}
