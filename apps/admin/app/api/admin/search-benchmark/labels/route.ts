import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { SEARCH_BENCHMARK_LABEL_FIELDS, SEARCH_BENCHMARK_QUERY_FIELDS, SEARCH_BENCHMARK_SCORECARD_FIELDS } from "@/lib/admin/search-security-projections";

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

async function authorize() {
  return requireAdminApiRole(["superadmin", "admin", "experience_team"]);
}

export async function GET() {
  const { error: authError } = await authorize();
  if (authError) return authError;

  const [{ data: queries, error: queryError }, { data: latestRun }] =
    await Promise.all([
      getAdminDatabaseClient()
        .from("search_benchmark_queries")
        .select(SEARCH_BENCHMARK_QUERY_FIELDS)
        .eq("active", true)
        .order("query_key"),
      getAdminDatabaseClient()
        .from("search_benchmark_runs")
        .select("id,run_key,status,started_at,release_gate_passed")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
  if (queryError) throw queryError;

  const queryIds = (queries ?? []).map((query: any) => query.id);
  const labelsResult = queryIds.length
    ? await getAdminDatabaseClient()
        .from("search_benchmark_labels")
        .select(SEARCH_BENCHMARK_LABEL_FIELDS)
        .in("query_id", queryIds)
    : { data: [] as any[] };
  const candidatesResult = latestRun?.id
    ? await getAdminDatabaseClient()
        .from("search_benchmark_run_results")
        .select("query_id,result_key,rank,variant,relevance_grade,violation_codes,metadata")
        .eq("run_id", latestRun.id)
        .eq("variant", "control")
        .order("query_id")
        .order("rank")
    : { data: [] as any[] };
  const { data: scorecards } = await getAdminDatabaseClient()
    .from("search_benchmark_scorecard_v1")
    .select(SEARCH_BENCHMARK_SCORECARD_FIELDS)
    .order("started_at", { ascending: false })
    .limit(10);

  return NextResponse.json({
    queries: queries ?? [],
    labels: labelsResult.data ?? [],
    candidates: candidatesResult.data ?? [],
    latest_run: latestRun ?? null,
    scorecards: scorecards ?? [],
  });
}

export async function POST(request: NextRequest) {
  const { adminUser, error: authError } = await authorize();
  if (authError) return authError;

  const body = await request.json().catch(() => null);
  const queryId = typeof body?.query_id === "string" ? body.query_id.trim().slice(0, 100) : null;
  const resultKey = typeof body?.result_key === "string" ? body.result_key.trim().slice(0, 300) : null;
  const grade = Number(body?.relevance_grade);
  const violations = Array.isArray(body?.violation_codes)
    ? body.violation_codes.filter(
        (value: unknown): value is string =>
          typeof value === "string" && ALLOWED_VIOLATIONS.has(value),
      ).slice(0, ALLOWED_VIOLATIONS.size)
    : [];

  if (!queryId || !resultKey || !Number.isInteger(grade) || grade < 0 || grade > 3) {
    return NextResponse.json({ error: "Invalid benchmark label" }, { status: 400 });
  }

  const { data: query } = await getAdminDatabaseClient().from("search_benchmark_queries").select("id").eq("id", queryId).eq("active", true).maybeSingle();
  if (!query) return NextResponse.json({ error: "Benchmark query not found" }, { status: 404 });

  const pairParts = resultKey.startsWith("pair:") ? resultKey.split(":") : [];
  const locationId = resultKey.startsWith("location:")
    ? resultKey.slice("location:".length)
    : null;

  const { data, error } = await getAdminDatabaseClient()
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
        notes: typeof body?.notes === "string" ? body.notes.trim().slice(0, 1000) || null : null,
        labeled_by: adminUser?.user_id ?? null,
        labeled_at: new Date().toISOString(),
      },
      { onConflict: "query_id,result_key" },
    )
    .select(SEARCH_BENCHMARK_LABEL_FIELDS)
    .single();
  if (error) throw error;

  return NextResponse.json({ success: true, label: data });
}
