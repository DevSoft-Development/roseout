import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CASES = [
  "date night in Brooklyn",
  "restaurant with hookah in Forest Hills",
  "dinner then hookah in Forest Hills",
  "seafood rooftop restaurant in Queens",
  "date night in Brooklyn, no museums",
  "restaurant and activity in Queens but no bowling",
  "date night in Brooklyn tomorrow at 7:30 pm",
] as const;

function nameOf(value: any) {
  return value?.name ?? value?.restaurant_name ?? value?.activity_name ?? null;
}

function pairSummary(value: any) {
  if (!value || typeof value !== "object") return null;
  const restaurant = value.restaurant ?? value.restaurantLocation ?? value.restaurant_location ?? null;
  const activity = value.activity ?? value.activityLocation ?? value.activity_location ?? null;
  return {
    restaurant: nameOf(restaurant),
    activity: nameOf(activity),
    distanceMiles: value.distanceMiles ?? value.distance_miles ?? null,
    walkingMinutes: value.walkingMinutes ?? value.walking_minutes ?? null,
  };
}

export async function GET(request: NextRequest) {
  const index = Number(request.nextUrl.searchParams.get("case") ?? "0");
  if (!Number.isInteger(index) || index < 0 || index >= CASES.length) {
    return NextResponse.json({ ok: false, error: "invalid case", caseCount: CASES.length }, { status: 400 });
  }

  const query = CASES[index];
  const started = Date.now();
  const response = await fetch("https://theouthaven.com/api/generate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": crypto.randomUUID(),
      "user-agent": "TheOutHaven-Production-QA-Probe/1.0",
    },
    body: JSON.stringify({ input: query }),
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });
  const payload: any = await response.json().catch(() => null);
  const elapsedMs = Date.now() - started;

  const plan = payload?.searchV2?.searchPlan ?? payload?.debug?.normalizedIntent ?? payload?.normalizedIntent ?? null;
  const timing = payload?.searchV2?.timing ?? payload?.timing ?? null;
  const restaurants = Array.isArray(payload?.restaurants) ? payload.restaurants : [];
  const activities = Array.isArray(payload?.activities) ? payload.activities : [];
  const pairs = Array.isArray(payload?.pairs) ? payload.pairs : [];

  return NextResponse.json({
    ok: response.ok,
    status: response.status,
    case: index,
    query,
    elapsedMs,
    success: payload?.success ?? null,
    requestId: payload?.requestId ?? payload?.searchV2?.requestId ?? null,
    mode: plan?.mode ?? plan?.searchType ?? null,
    primaryDomain: plan?.primaryDomain ?? payload?.primary_domain ?? payload?.primaryDomain ?? null,
    geo: plan?.geo ?? null,
    occasion: plan?.occasion ?? null,
    plannedFor: plan?.plannedFor ?? payload?.plannedFor ?? payload?.parsedDateTimeISO ?? null,
    restaurantExclusions: plan?.restaurant?.exclusions ?? null,
    activityExclusions: plan?.activity?.exclusions ?? null,
    restaurantTerms: plan?.restaurant?.foods ?? plan?.restaurantTerms ?? null,
    activityCategories: plan?.activity?.categories ?? plan?.activityTerms ?? null,
    counts: {
      restaurants: restaurants.length,
      activities: activities.length,
      pairs: pairs.length,
    },
    topRestaurants: restaurants.slice(0, 5).map((item: any) => ({
      name: nameOf(item),
      city: item?.city ?? null,
      miles: item?.distance_miles ?? item?.distanceMiles ?? item?.distance ?? null,
      reasons: item?.matchReasons ?? item?.whyMatched ?? item?.why_it_matched ?? null,
    })),
    topActivities: activities.slice(0, 5).map((item: any) => ({
      name: nameOf(item),
      city: item?.city ?? null,
      type: item?.activity_type ?? item?.primary_category ?? null,
      miles: item?.distance_miles ?? item?.distanceMiles ?? item?.distance ?? null,
      reasons: item?.matchReasons ?? item?.whyMatched ?? item?.why_it_matched ?? null,
    })),
    topPairs: pairs.slice(0, 5).map(pairSummary),
    timing,
    error: payload?.error ?? null,
  });
}
