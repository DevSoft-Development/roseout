import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireBetaAdmin, safeError } from "../_shared";

export const dynamic = "force-dynamic";

async function audit(auth: Awaited<ReturnType<typeof requireBetaAdmin>>, action: string, entityId: string | null, metadata = {}) {
  await supabaseAdmin.from("admin_audit_logs").insert({
    actor_user_id: auth.adminUser?.user_id ?? null,
    actor_email: auth.adminUser?.email ?? null,
    actor_role: auth.adminUser?.role ?? null,
    action,
    entity_type: "beta_task",
    entity_id: entityId,
    summary: `Admin ${action.replace(/_/g, " ")}`,
    metadata,
  });
}

export async function GET() {
  const auth = await requireBetaAdmin();
  if (auth.error) return auth.error;
  const { data, error } = await supabaseAdmin.from("beta_tasks").select("*").in("status", ["active", "draft"]).order("created_at", { ascending: false }).limit(100);
  if (error) return safeError("Unable to load weekly beta tasks.", 500);
  return NextResponse.json({ success: true, tasks: data || [] });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireBetaAdmin();
  if (auth.error) return auth.error;
  try {
    const body = await req.json();
    const { id } = body;
    if (!id) return safeError("Missing task id.", 400);
    const allowed = ["title", "description", "test_url", "assigned_prompt", "predefined_prompt", "feature_area", "priority", "status", "instructions"];
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of allowed) if (key in body) updates[key === "assigned_prompt" ? "predefined_prompt" : key] = body[key];
    const { data, error } = await supabaseAdmin.from("beta_tasks").update(updates).eq("id", id).select("*").single();
    if (error) throw error;
    await audit(auth, "weekly_task_updated", String(id), updates);
    return NextResponse.json({ success: true, task: data });
  } catch (error) {
    console.error("UPDATE_WEEKLY_TASK", error);
    return safeError("Unable to update weekly beta task.", 500);
  }
}
