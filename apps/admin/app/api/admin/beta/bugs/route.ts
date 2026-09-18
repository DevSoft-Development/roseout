import { NextRequest, NextResponse } from "next/server";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { requireBetaAdmin, safeError } from "../_shared";

const BUG_FIELDS = "id,tester_id,user_id,title,description,steps_to_reproduce,expected_result,actual_result,severity,feature_area,page_url,screenshot_url,browser,device,turnstile_verified,status,admin_notes,reviewed_by,reviewed_at,created_at,updated_at" as const;
const BUG_STATUSES = new Set(["new", "reviewing", "confirmed", "resolved", "closed", "dismissed"]);

export async function GET() {
  const auth = await requireBetaAdmin();
  if (auth.error) return auth.error;
  const { data, error } = await getAdminDatabaseClient().from("beta_bug_reports").select(BUG_FIELDS).order("created_at", { ascending: false }).limit(300);
  if (error) return safeError();
  return NextResponse.json({ success: true, bugs: data || [] });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireBetaAdmin();
  if (auth.error) return auth.error;
  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ success: false, error: "Bug report is required." }, { status: 400 });
  const status = typeof body.status === "string" && BUG_STATUSES.has(body.status) ? body.status : undefined;
  const adminNotes = typeof body.admin_notes === "string" ? body.admin_notes.trim().slice(0, 4000) || null : undefined;
  if (status === undefined && adminNotes === undefined) return NextResponse.json({ success: false, error: "No review changes were provided." }, { status: 400 });
  const patch: Record<string, unknown> = { reviewed_by: auth.adminUser?.user_id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  if (status !== undefined) patch.status = status;
  if (adminNotes !== undefined) patch.admin_notes = adminNotes;
  const { data, error } = await getAdminDatabaseClient().from("beta_bug_reports").update(patch).eq("id", id).select(BUG_FIELDS).single();
  if (error) return safeError();
  return NextResponse.json({ success: true, bug: data });
}
