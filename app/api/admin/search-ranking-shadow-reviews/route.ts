import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorize() {
  return requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
}

export async function GET() {
  const { error } = await authorize();
  if (error) return error;

  const [validation, readiness, experiments] = await Promise.all([
    supabaseAdmin.from("search_ranking_shadow_validation_v1").select("*").limit(1).maybeSingle(),
    supabaseAdmin.from("search_ranking_shadow_readiness_v1").select("*").limit(1).maybeSingle(),
    supabaseAdmin
      .from("search_ranking_experiments")
      .select("id,search_id,market,latency_ms,no_results,pair_count,restaurant_control_order,restaurant_hybrid_order,activity_control_order,activity_hybrid_order,metadata,created_at,search_ranking_experiment_reviews(decision,reason_tags,notes,reviewed_at)")
      .eq("metadata->>test_mode", "true")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return NextResponse.json({
    validation: validation.data ?? null,
    readiness: readiness.data ?? null,
    experiments: experiments.data ?? [],
  });
}

export async function POST(request: NextRequest) {
  const { adminUser, error } = await authorize();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const experimentId = String(body.experiment_id || "").trim();
  const decision = String(body.decision || "").trim();
  const allowed = new Set(["better", "same", "worse", "unsafe", "needs_review"]);
  if (!experimentId || !allowed.has(decision)) {
    return NextResponse.json({ error: "A valid experiment and decision are required." }, { status: 400 });
  }

  const reasonTags = Array.isArray(body.reason_tags)
    ? body.reason_tags.map(String).map((value: string) => value.trim()).filter(Boolean).slice(0, 10)
    : [];

  const { data, error: upsertError } = await supabaseAdmin
    .from("search_ranking_experiment_reviews")
    .upsert({
      experiment_id: experimentId,
      decision,
      reason_tags: reasonTags,
      notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : null,
      reviewed_by: adminUser?.user_id ?? null,
      reviewed_at: new Date().toISOString(),
    }, { onConflict: "experiment_id" })
    .select("*")
    .single();

  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 400 });
  return NextResponse.json({ success: true, review: data });
}
