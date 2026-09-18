import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALIDATION_FIELDS = "shadow_searches,test_mode_searches,changed_order_searches,changed_order_rate,avg_latency_ms,p95_latency_ms,no_result_rate,avg_pair_count,reviewed_searches,better_reviews,same_reviews,worse_reviews,unsafe_reviews,needs_review_reviews";
const READINESS_FIELDS = `${VALIDATION_FIELDS},superadmin_approved,worse_rate,ready_for_admin_5,blocking_reasons`;
const EXPERIMENT_FIELDS = "id,search_id,market,latency_ms,no_results,pair_count,restaurant_control_order,restaurant_hybrid_order,activity_control_order,activity_hybrid_order,created_at,search_ranking_experiment_reviews(decision,reason_tags,notes,reviewed_at)";
const REVIEW_FIELDS = "id,experiment_id,decision,reason_tags,notes,reviewed_at";
const ALLOWED_DECISIONS = new Set(["better", "same", "worse", "unsafe", "needs_review"]);

async function authorize() {
  return requireAdminApiRole(["superadmin", "admin", "experience_team"]);
}

export async function GET() {
  const { error } = await authorize();
  if (error) return error;

  const [validation, readiness, experiments] = await Promise.all([
    getAdminDatabaseClient().from("search_ranking_shadow_validation_v1").select(VALIDATION_FIELDS).limit(1).maybeSingle(),
    getAdminDatabaseClient().from("search_ranking_shadow_readiness_v1").select(READINESS_FIELDS).limit(1).maybeSingle(),
    getAdminDatabaseClient()
      .from("search_ranking_experiments")
      .select(EXPERIMENT_FIELDS)
      .eq("metadata->>test_mode", "true")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return NextResponse.json({ validation: validation.data ?? null, readiness: readiness.data ?? null, experiments: experiments.data ?? [] });
}

export async function POST(request: NextRequest) {
  const { adminUser, error } = await authorize();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const experimentId = typeof body.experiment_id === "string" ? body.experiment_id.trim().slice(0, 80) : "";
  const decision = typeof body.decision === "string" ? body.decision.trim() : "";
  if (!experimentId || !ALLOWED_DECISIONS.has(decision)) {
    return NextResponse.json({ error: "A valid experiment and decision are required." }, { status: 400 });
  }

  const { data: experiment } = await getAdminDatabaseClient().from("search_ranking_experiments").select("id").eq("id", experimentId).eq("metadata->>test_mode", "true").maybeSingle();
  if (!experiment) return NextResponse.json({ error: "Shadow experiment not found." }, { status: 404 });

  const reasonTags = Array.isArray(body.reason_tags)
    ? body.reason_tags.map(String).map((value: string) => value.trim().slice(0, 80)).filter(Boolean).slice(0, 10)
    : [];

  const { data, error: upsertError } = await getAdminDatabaseClient()
    .from("search_ranking_experiment_reviews")
    .upsert({
      experiment_id: experimentId,
      decision,
      reason_tags: reasonTags,
      notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : null,
      reviewed_by: adminUser?.user_id ?? null,
      reviewed_at: new Date().toISOString(),
    }, { onConflict: "experiment_id" })
    .select(REVIEW_FIELDS)
    .single();

  if (upsertError) return NextResponse.json({ error: "Unable to save shadow review." }, { status: 400 });
  return NextResponse.json({ success: true, review: data });
}
