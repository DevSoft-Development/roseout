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

  const [readiness, runs, approvals, alerts, audit] = await Promise.all([
    supabaseAdmin.from("search_ranking_rollout_completion_readiness_v1").select("*").limit(1).maybeSingle(),
    supabaseAdmin.from("search_ranking_rollout_runs").select("*").order("created_at", { ascending: false }).limit(25),
    supabaseAdmin.from("search_ranking_rollout_approvals").select("*").order("approved_at", { ascending: false }).limit(25),
    supabaseAdmin.from("search_ranking_rollout_alerts").select("*").order("created_at", { ascending: false }).limit(50),
    supabaseAdmin.from("search_ranking_rollout_audit_log").select("*").order("created_at", { ascending: false }).limit(100),
  ]);

  return NextResponse.json({
    readiness: readiness.data ?? null,
    runs: runs.data ?? [],
    approvals: approvals.data ?? [],
    alerts: alerts.data ?? [],
    audit: audit.data ?? [],
  });
}

export async function POST(request: NextRequest) {
  const { adminUser, error } = await authorize();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "");
  const reason = String(body.reason || "").trim();
  if (!reason) return NextResponse.json({ error: "A reason is required." }, { status: 400 });

  const actorUserId = adminUser?.user_id ?? null;

  if (action === "start") {
    const { data, error: rpcError } = await supabaseAdmin.rpc("start_search_ranking_rollout_run", {
      target_stage_key: String(body.target_stage_key || "admin_shadow"),
      actor_user_id: actorUserId,
      reason,
    });
    if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 400 });
    return NextResponse.json({ success: true, rolloutRunId: data });
  }

  if (action === "approve" || action === "reject" || action === "revoke") {
    const decision = action === "approve" ? "approved" : action === "reject" ? "rejected" : "revoked";
    const { data, error: rpcError } = await supabaseAdmin.rpc("record_search_ranking_rollout_approval", {
      rollout_run_id: String(body.rollout_run_id || ""),
      target_stage_key: String(body.target_stage_key || ""),
      actor_user_id: actorUserId,
      decision,
      reason,
    });
    if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 400 });
    return NextResponse.json({ success: true, approvalId: data });
  }

  if (action === "complete" || action === "rollback" || action === "cancel") {
    const finalStatus = action === "complete" ? "completed" : action === "rollback" ? "rolled_back" : "cancelled";
    const { error: rpcError } = await supabaseAdmin.rpc("complete_search_ranking_rollout_run", {
      rollout_run_id: String(body.rollout_run_id || ""),
      actor_user_id: actorUserId,
      final_status: finalStatus,
      reason,
    });
    if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 400 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unsupported rollout run action." }, { status: 400 });
}
