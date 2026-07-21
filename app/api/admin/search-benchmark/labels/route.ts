import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_VIOLATIONS = new Set([
  "wrong_domain",
  "wrong_market",
  "too_far",
  "closed_or_unavailable",
  "bad_pair",
  "duplicate",
  "unsafe_or_unpublishable",
]);

type LocationSummary = {
  id: string;
  name: string | null;
  restaurant_name: string | null;
  activity_name: string | null;
  location_type: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  market: string | null;
};

async function authorize() {
  return requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
}

function locationName(location: LocationSummary | undefined) {
  if (!location) return null;
  return (
    location.name ||
    location.restaurant_name ||
    location.activity_name ||
    "Unnamed location"
  );
}

function locationAddress(location: LocationSummary | undefined) {
  if (!location) return null;
  return [location.address, location.city, location.state]
    .filter(Boolean)
    .join(", ");
}

function resultLocationIds(resultKey: string) {
  if (resultKey.startsWith("location:")) {
    return [resultKey.slice("location:".length)];
  }

  if (resultKey.startsWith("pair:")) {
    const [, restaurantId, activityId] = resultKey.split(":");
    return [restaurantId, activityId].filter(Boolean);
  }

  return [];
}

export async function GET() {
  const { error: authError } = await authorize();
  if (authError) return authError;

  const [{ data: queries, error: queryError }, { data: latestRun }] =
    await Promise.all([
      supabaseAdmin
        .from("search_benchmark_queries")
        .select("*")
        .eq("active", true)
        .order("query_key"),
      supabaseAdmin
        .from("search_benchmark_runs")
        .select("id,run_key,status,started_at,release_gate_passed")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
  if (queryError) throw queryError;

  const queryIds = (queries ?? []).map((query: any) => query.id);
  const labelsResult = queryIds.length
    ? await supabaseAdmin
        .from("search_benchmark_labels")
        .select("*")
        .in("query_id", queryIds)
    : { data: [] as any[] };

  const candidatesResult = latestRun?.id
    ? await supabaseAdmin
        .from("search_benchmark_run_results")
        .select(
          "query_id,result_key,rank,variant,relevance_grade,violation_codes,metadata",
        )
        .eq("run_id", latestRun.id)
        .eq("variant", "control")
        .order("query_id")
        .order("rank")
    : { data: [] as any[] };

  const candidates = candidatesResult.data ?? [];
  const locationIds = [
    ...new Set(
      candidates.flatMap((candidate: any) =>
        resultLocationIds(String(candidate.result_key || "")),
      ),
    ),
  ];

  const locationsResult = locationIds.length
    ? await supabaseAdmin
        .from("locations")
        .select(
          "id,name,restaurant_name,activity_name,location_type,address,city,state,market",
        )
        .in("id", locationIds)
    : { data: [] as LocationSummary[] };

  const locationsById = new Map<string, LocationSummary>(
    ((locationsResult.data ?? []) as LocationSummary[]).map((location) => [
      location.id,
      location,
    ]),
  );

  const enrichedCandidates = candidates.map((candidate: any) => {
    const resultKey = String(candidate.result_key || "");

    if (resultKey.startsWith("pair:")) {
      const [, restaurantId, activityId] = resultKey.split(":");
      const restaurant = locationsById.get(restaurantId);
      const activity = locationsById.get(activityId);
      const restaurantName = locationName(restaurant);
      const activityName = locationName(activity);

      return {
        ...candidate,
        metadata: {
          ...(candidate.metadata ?? {}),
          name:
            restaurantName && activityName
              ? `${restaurantName} + ${activityName}`
              : restaurantName || activityName || "Unknown pair",
          restaurant_name: restaurantName,
          activity_name: activityName,
          restaurant_address: locationAddress(restaurant),
          activity_address: locationAddress(activity),
          restaurant_type: restaurant?.location_type ?? null,
          activity_type: activity?.location_type ?? null,
          restaurant_market: restaurant?.market ?? null,
          activity_market: activity?.market ?? null,
        },
      };
    }

    const [locationId] = resultLocationIds(resultKey);
    const location = locationsById.get(locationId);

    return {
      ...candidate,
      metadata: {
        ...(candidate.metadata ?? {}),
        name: locationName(location) || "Unknown location",
        address: locationAddress(location),
        location_type: location?.location_type ?? null,
        market: location?.market ?? null,
      },
    };
  });

  const { data: scorecards } = await supabaseAdmin
    .from("search_benchmark_scorecard_v1")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(10);

  return NextResponse.json({
    queries: queries ?? [],
    labels: labelsResult.data ?? [],
    candidates: enrichedCandidates,
    latest_run: latestRun ?? null,
    scorecards: scorecards ?? [],
  });
}

export async function POST(request: NextRequest) {
  const { adminUser, error: authError } = await authorize();
  if (authError) return authError;

  const body = await request.json().catch(() => null);
  const queryId = typeof body?.query_id === "string" ? body.query_id : null;
  const resultKey = typeof body?.result_key === "string" ? body.result_key : null;
  const grade = Number(body?.relevance_grade);
  const violations = Array.isArray(body?.violation_codes)
    ? body.violation_codes.filter(
        (value: unknown): value is string =>
          typeof value === "string" && ALLOWED_VIOLATIONS.has(value),
      )
    : [];

  if (!queryId || !resultKey || !Number.isInteger(grade) || grade < 0 || grade > 3) {
    return NextResponse.json({ error: "Invalid benchmark label" }, { status: 400 });
  }

  const pairParts = resultKey.startsWith("pair:") ? resultKey.split(":") : [];
  const locationId = resultKey.startsWith("location:")
    ? resultKey.slice("location:".length)
    : null;

  const { data, error } = await supabaseAdmin
    .from("search_benchmark_labels")
    .upsert(
      {
        query_id: queryId,
        result_key: resultKey,
        location_id: locationId,
        restaurant_location_id: pairParts[1] || null,
        activity_location_id: pairParts[2] || null,
        relevance_grade: grade,
        violation_codes: violations,
        notes: typeof body?.notes === "string" ? body.notes.slice(0, 1000) : null,
        labeled_by: adminUser?.user_id ?? null,
        labeled_at: new Date().toISOString(),
      },
      { onConflict: "query_id,result_key" },
    )
    .select("*")
    .single();
  if (error) throw error;

  return NextResponse.json({ success: true, label: data });
}
