import { handleGeneratePost } from "@/lib/search/public-api/controller";
import { mobileJson, mobileError } from "../_lib/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MobileSearchBody = {
  query?: string;
  when?: string;
  area?: string;
  partySize?: number | string;
  budget?: string;
  travel?: string;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildCanonicalMessage(body: MobileSearchBody) {
  const query = text(body.query);
  if (!query) return "";

  const qualifiers = [
    text(body.when),
    text(body.area) && text(body.area).toLowerCase() !== "near me" ? `in ${text(body.area)}` : "near me",
    text(body.budget) ? `budget ${text(body.budget)}` : "",
    text(body.travel) === "walking" ? "walking distance" : "",
  ].filter(Boolean);

  return [query, ...qualifiers].join(" ");
}

function pickName(value: any) {
  return String(value?.name || value?.restaurant_name || value?.activity_name || "TheOutHaven location");
}

function pickCategory(value: any) {
  return String(value?.category || value?.primary_category || value?.cuisine || value?.activity_type || value?.location_type || "");
}

function pickImage(value: any) {
  const image = value?.image_url || value?.image || value?.photo_url || value?.photo || value?.photos?.[0];
  return typeof image === "string" ? image : null;
}

function shapePlace(value: any, kind: "restaurant" | "activity") {
  return {
    id: String(value?.id || value?.location_id || value?.source_id || ""),
    name: pickName(value),
    kind,
    category: pickCategory(value),
    imageUrl: pickImage(value),
    rating: Number.isFinite(Number(value?.rating)) ? Number(value.rating) : null,
    priceLevel: typeof value?.price_level === "string" ? value.price_level : typeof value?.price === "string" ? value.price : null,
    distanceMiles: Number.isFinite(Number(value?.distance_miles)) ? Number(value.distance_miles) : Number.isFinite(Number(value?.distanceMiles)) ? Number(value.distanceMiles) : null,
  };
}

function shapePair(value: any, index: number) {
  const restaurant = value?.restaurant || value?.restaurant_location || value?.restaurantLocation || null;
  const activity = value?.activity || value?.activity_location || value?.activityLocation || null;
  return {
    id: String(value?.id || value?.pair_id || `pair-${index}`),
    restaurant: restaurant ? shapePlace(restaurant, "restaurant") : null,
    activity: activity ? shapePlace(activity, "activity") : null,
    distanceMiles: Number.isFinite(Number(value?.distance_miles)) ? Number(value.distance_miles) : Number.isFinite(Number(value?.distanceMiles)) ? Number(value.distanceMiles) : null,
    walkMinutes: Number.isFinite(Number(value?.walk_minutes)) ? Number(value.walk_minutes) : Number.isFinite(Number(value?.walkMinutes)) ? Number(value.walkMinutes) : null,
    reason: typeof value?.reason === "string" ? value.reason : typeof value?.pairing_reason === "string" ? value.pairing_reason : null,
  };
}

export async function POST(request: Request) {
  let body: MobileSearchBody;
  try {
    body = (await request.json()) as MobileSearchBody;
  } catch {
    return mobileError("INVALID_JSON", "Search request was not valid JSON.", 400);
  }

  const message = buildCanonicalMessage(body);
  if (!message) return mobileError("QUERY_REQUIRED", "Tell TheOutHaven what you want to do.", 400);

  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");

  const guestId = headers.get("x-theouthaven-guest-id")?.trim();
  if (guestId && !headers.get("cookie")) {
    headers.set("cookie", `guest_search_id=${encodeURIComponent(guestId)}`);
  }

  const canonicalRequest = new Request(request.url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      message,
      query: message,
      partySize: body.partySize,
      budget: body.budget,
      travelPreference: body.travel,
      source: "mobile_v1",
    }),
  });

  const canonicalResponse = await handleGeneratePost(canonicalRequest);
  let payload: any = null;
  try {
    payload = await canonicalResponse.clone().json();
  } catch {
    return mobileError("SEARCH_FAILED", "TheOutHaven could not complete that search.", canonicalResponse.status || 500);
  }

  if (!canonicalResponse.ok) {
    const code = payload?.error?.code || payload?.code || "SEARCH_FAILED";
    const messageText = payload?.error?.message || payload?.message || "TheOutHaven could not complete that search.";
    return mobileError(String(code), String(messageText), canonicalResponse.status);
  }

  const restaurants = Array.isArray(payload?.restaurants) ? payload.restaurants.map((item: any) => shapePlace(item, "restaurant")) : [];
  const activities = Array.isArray(payload?.activities) ? payload.activities.map((item: any) => shapePlace(item, "activity")) : [];
  const pairs = Array.isArray(payload?.pairs) ? payload.pairs.map(shapePair) : [];

  return mobileJson({
    ok: true,
    requestId: payload?.request_id || payload?.requestId || null,
    reply: typeof payload?.reply === "string" ? payload.reply : null,
    renderMode: payload?.render_mode || payload?.renderMode || (pairs.length ? "outings" : "places"),
    pairs,
    restaurants,
    activities,
  });
}
