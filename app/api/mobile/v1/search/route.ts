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
  const id = String(value?.id || value?.location_id || value?.source_id || "");
  return {
    id,
    name: pickName(value),
    kind,
    category: pickCategory(value),
    imageUrl: pickImage(value),
    rating: numberOrNull(value?.rating),
    priceLevel: firstText(value?.price_level, value?.price),
    distanceMiles: numberOrNull(value?.distance_miles ?? value?.distanceMiles),
    publicUrl: firstText(value?.public_url, value?.detail_url, value?.profile_href),
    reservationUrl: firstText(value?.reservation_url, value?.reservation_link, value?.external_reservation_url),
    websiteUrl: firstText(value?.website, value?.website_url, value?.official_website),
    phone: firstText(value?.phone, value?.phone_number, value?.formatted_phone),
    address: firstText(value?.formatted_address, value?.full_address, value?.address),
    latitude: numberOrNull(value?.latitude ?? value?.lat),
    longitude: numberOrNull(value?.longitude ?? value?.lng ?? value?.lon),
  };
}

function shapePair(value: any, index: number) {
  const restaurant = value?.restaurant || value?.restaurant_location || value?.restaurantLocation || null;
  const activity = value?.activity || value?.activity_location || value?.activityLocation || null;
  return {
    id: String(value?.id || value?.pair_id || `pair-${index}`),
    restaurant: restaurant ? shapePlace(restaurant, "restaurant") : null,
    activity: activity ? shapePlace(activity, "activity") : null,
    distanceMiles: numberOrNull(value?.distance_miles ?? value?.distanceMiles),
    walkMinutes: numberOrNull(value?.walk_minutes ?? value?.walkMinutes),
    reason: firstText(value?.reason, value?.pairing_reason),
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
