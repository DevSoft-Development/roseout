import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { getRankingRolloutSettings } from "@/lib/search/rankingRollout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ANALYTICS_FIELDS = "variant,searches,no_result_rate,avg_pair_count,p95_latency_ms";
const READINESS_FIELDS = "current_stage,next_stage,ready_to_promote,minutes_in_stage,control_sample_size,hybrid_sample_size,blocking_reasons";

async function authorize() {
  return requireAdminApiRole(["superadmin", "admin", "experience_team"]);
}

function cleanReason(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 1000) : "";
}

export async function GET() {
  const { error } = await authorize();
  if (error) return error;

  const [settings, analyticsResult, recentResult, readinessResult, stagesResult, historyResult, cohortResult] = await Promise.all([
    getRankingRolloutSettings(),
    getAdminDatabaseClient().from("search_ranking_rollout_analytics_v1").select(ANALYTICS_FIELDS),
    getAdminDatabaseClient().from("search_ranking_experiments").select("variant,market,rollout_percent,model_version,latency_ms,no_results,pair_count,created_at").order("created_at", { ascending: false }).limit(25),
    getAdminDatabaseClient().from("search_ranking_rollout_readiness_v1").select(READINESS_FIELDS).limit(1).maybeSingle(),
    getAdminDatabaseClient().from("search_ranking_rollout_stages").select("stage_key,sort_order,rollout_percent,audience_type,minimum_sample_size,minimum_observation_minutes,eligible_markets").eq("enabled", true).order("sort_order"),
    getAdminDatabaseClient().from("search_ranking_rollout_stage_history").select("from_stage_key,to_stage_key,change_type,reason,created_at").order("created_at", { ascending: false }).limit(20),
    getAdminDatabaseClient().from("search_ranking_internal_cohort").select("user_id", { count: "exact", head: true }).eq("enabled", true).or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`),
  ]);

  return NextResponse.json({ settings, analytics: analyticsResult.data ?? [], recent: recentResult.data ?? [], readiness: readinessResult.data ?? null, stages: stagesResult.data ?? [], history: historyResult.data ?? [], internalCohortCount: cohortResult.count ?? 0 });
}

export async function POST(request: NextRequest) {
  const { adminUser, error } = await authorize();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "");
  const reason = cleanReason(body.reason);
  if (!reason) return NextResponse.json({ error: "A reason is required." }, { status: 400 });

  if (action === "disable") {
    const { error: rpcError } = await getAdminDatabaseClient().rpc("disable_search_ranking_rollout", { actor_user_id: adminUser?.user_id ?? null, reason });
    if (rpcError) return NextResponse.json({ error: "Unable to disable ranking rollout." }, { status: 400 });
    return NextResponse.json({ success: true });
  }

  if (action === "activate") {
    const targetStageKey = String(body.target_stage_key || "").trim().slice(0, 100);
    if (!targetStageKey) return NextResponse.json({ error: "A target stage is required." }, { status: 400 });
    const { data: stage } = await getAdminDatabaseClient().from("search_ranking_rollout_stages").select("stage_key").eq("stage_key", targetStageKey).eq("enabled", true).maybeSingle();
    if (!stage) return NextResponse.json({ error: "Target stage is not enabled." }, { status: 400 });
    const { error: rpcError } = await getAdminDatabaseClient().rpc("activate_search_ranking_stage", { target_stage_key: targetStageKey, actor_user_id: adminUser?.user_id ?? null, reason, force: false });
    if (rpcError) return NextResponse.json({ error: "Unable to activate ranking stage." }, { status: 400 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unsupported rollout action." }, { status: 400 });
}
