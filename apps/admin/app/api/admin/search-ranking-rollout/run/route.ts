import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const READINESS_FIELDS = "current_stage,rollout_run_id,rollout_run_status,shadow_searches,reviewed_searches,unsafe_reviews,worse_rate,p95_latency_ms,open_critical_alerts,admin_5_approved,ready_for_admin_5,blocking_reasons";
const RUN_FIELDS = "id,stage_key,status,started_at,completed_at,completion_reason,created_at,updated_at";
const APPROVAL_FIELDS = "id,rollout_run_id,target_stage_key,decision,reason,approved_at,revoked_at";
const ALERT_FIELDS = "id,rollout_run_id,severity,alert_type,message,acknowledged_at,created_at";
const AUDIT_FIELDS = "id,rollout_run_id,action,from_stage_key,to_stage_key,reason,created_at";

async function authorize() {
  return requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
}

function bounded(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET() {
  const { error } = await authorize();
  if (error) return error;

  const [readiness, runs, approvals, alerts, audit] = await Promise.all([
    supabaseAdmin.from("search_ranking_rollout_completion_readiness_v1").select(READINESS_FIELDS).limit(1).maybeSingle(),
    supabaseAdmin.from("search_ranking_rollout_runs").select(RUN_FIELDS).order("created_at", { ascending: false }).limit(25),
    supabaseAdmin.from("search_ranking_rollout_approvals").select(APPROVAL_FIELDS).order("approved_at", { ascending: false }).limit(25),
    supabaseAdmin.from("search_ranking_rollout_alerts").select(ALERT_FIELDS).order("created_at", { ascending: false }).limit(50),
    supabaseAdmin.from("search_ranking_rollout_audit_log").select(AUDIT_FIELDS).order("created_at", { ascending: false }).limit(100),
  ]);

  return NextResponse.json({ readiness: readiness.data ?? null, runs: runs.data ?? [], approvals: approvals.data ?? [], alerts: alerts.data ?? [], audit: audit.data ?? [] });
}

export async function POST(request: NextRequest) {
  const { adminUser, error } = await authorize();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "");
  const reason = bounded(body.reason, 1000);
  if (!reason) return NextResponse.json({ error: "A reason is required." }, { status: 400 });

  const actorUserId = adminUser?.user_id ?? null;

  if (action === "start") {
    const targetStageKey = bounded(body.target_stage_key || "admin_shadow", 100);
    const { data: stage } = await supabaseAdmin.from("search_ranking_rollout_stages").select("stage_key").eq("stage_key", targetStageKey).eq("enabled", true).maybeSingle();
    if (!stage) return NextResponse.json({ error: "Target stage is not enabled." }, { status: 400 });
    const { data, error: rpcError } = await supabaseAdmin.rpc("start_search_ranking_rollout_run", { target_stage_key: targetStageKey, actor_user_id: actorUserId, reason });
    if (rpcError) return NextResponse.json({ error: "Unable to start rollout run." }, { status: 400 });
    return NextResponse.json({ success: true, rolloutRunId: data });
  }

  if (action === "approve" || action === "reject" || action === "revoke") {
    const rolloutRunId = bounded(body.rollout_run_id, 80);
    const targetStageKey = bounded(body.target_stage_key, 100);
    if (!rolloutRunId || !targetStageKey) return NextResponse.json({ error: "A rollout run and target stage are required." }, { status: 400 });
    const decision = action === "approve" ? "approved" : action === "reject" ? "rejected" : "revoked";
    const { data, error: rpcError } = await supabaseAdmin.rpc("record_search_ranking_rollout_approval", { rollout_run_id: rolloutRunId, target_stage_key: targetStageKey, actor_user_id: actorUserId, decision, reason });
    if (rpcError) return NextResponse.json({ error: "Unable to record rollout approval." }, { status: 400 });
    return NextResponse.json({ success: true, approvalId: data });
  }

  if (action === "complete" || action === "rollback" || action === "cancel") {
    const rolloutRunId = bounded(body.rollout_run_id, 80);
    if (!rolloutRunId) return NextResponse.json({ error: "A rollout run is required." }, { status: 400 });
    const finalStatus = action === "complete" ? "completed" : action === "rollback" ? "rolled_back" : "cancelled";
    const { error: rpcError } = await supabaseAdmin.rpc("complete_search_ranking_rollout_run", { rollout_run_id: rolloutRunId, actor_user_id: actorUserId, final_status: finalStatus, reason });
    if (rpcError) return NextResponse.json({ error: "Unable to update rollout run." }, { status: 400 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unsupported rollout run action." }, { status: 400 });
}
