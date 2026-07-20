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

async function authorize() {
  return requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
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
  const [{ data: labels }, { data: candidates }, { data: scorecards }] =
    await Promise.all([
      queryIds.length
        ? supabaseAdmin
            .from("search_benchmark_labels")
            .select("*")
            .in("query_id", queryIds)
        : Promise.resolve({ data: [] }),
      latestRun?.id
        ? supabaseAdmin
            .from("search_benchmark_run_results")
            .select("query_id,result_key,rank,variant,relevance_grade,violation_codes,metadata")
            .eq("run_id", latestRun.id)
            .eq("variant", "control")
            .order("query_id")
            .order("rank")
        : Promise.resolve({ data: [] }),
      supabaseAdmin
        .from("search_benchmark_scorecard_v1")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(10),
    ]);

  return NextResponse.json({
    queries: queries ?? [],
    labels: labels ?? [],
    candidates: candidates ?? [],
    latest_run: latestRun ?? null,
    scorecards: scorecards ?? [],
  });
}

export async function POST(request: NextRequest) {
  const { user, error: authError } = await authorize();
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
        labeled_by: user?.id ?? null,
        labeled_at: new Date().toISOString(),
      },
      { onConflict: "query_id,result_key" },
    )
    .select("*")
    .single();
  if (error) throw error;

  return NextResponse.json({ success: true, label: data });
}
