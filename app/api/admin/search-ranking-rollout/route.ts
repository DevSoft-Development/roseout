import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getRankingRolloutSettings } from "@/lib/search/rankingRollout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorize() {
  return requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
}

export async function GET() {
  const { error } = await authorize();
  if (error) return error;

  const [settings, analyticsResult, recentResult, readinessResult, stagesResult, historyResult, cohortResult] = await Promise.all([
    getRankingRolloutSettings(),
    supabaseAdmin.from("search_ranking_rollout_analytics_v1").select("*"),
    supabaseAdmin.from("search_ranking_experiments").select("variant,market,rollout_percent,model_version,latency_ms,no_results,pair_count,created_at").order("created_at", { ascending: false }).limit(25),
    supabaseAdmin.from("search_ranking_rollout_readiness_v1").select("*").limit(1).maybeSingle(),
    supabaseAdmin.from("search_ranking_rollout_stages").select("stage_key,sort_order,rollout_percent,audience_type,minimum_sample_size,minimum_observation_minutes,eligible_markets").eq("enabled", true).order("sort_order"),
    supabaseAdmin.from("search_ranking_rollout_stage_history").select("from_stage_key,to_stage_key,change_type,reason,created_at").order("created_at", { ascending: false }).limit(20),
    supabaseAdmin.from("search_ranking_internal_cohort").select("user_id", { count: "exact", head: true }).eq("enabled", true).or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`),
  ]);

  return NextResponse.json({
    settings,
    analytics: analyticsResult.data ?? [],
    recent: recentResult.data ?? [],
    readiness: readinessResult.data ?? null,
    stages: stagesResult.data ?? [],
    history: historyResult.data ?? [],
    internalCohortCount: cohortResult.count ?? 0,
  });
}

export async function POST(request: NextRequest) {
  const { adminUser, error } = await authorize();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "");
  const reason = String(body.reason || "").trim();
  if (!reason) return NextResponse.json({ error: "A reason is required." }, { status: 400 });

  if (action === "disable") {
    const { data, error: rpcError } = await supabaseAdmin.rpc("disable_search_ranking_rollout", {
      actor_user_id: adminUser?.user_id ?? null,
      reason,
    });
    if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 400 });
    return NextResponse.json({ success: true, result: data });
  }

  if (action === "activate") {
    const targetStageKey = String(body.target_stage_key || "").trim();
    if (!targetStageKey) return NextResponse.json({ error: "A target stage is required." }, { status: 400 });
    const { data, error: rpcError } = await supabaseAdmin.rpc("activate_search_ranking_stage", {
      target_stage_key: targetStageKey,
      actor_user_id: adminUser?.user_id ?? null,
      reason,
      force: false,
    });
    if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 400 });
    return NextResponse.json({ success: true, result: data });
  }

  return NextResponse.json({ error: "Unsupported rollout action." }, { status: 400 });
}
