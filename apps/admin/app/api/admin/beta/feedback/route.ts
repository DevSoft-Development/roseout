import { NextRequest, NextResponse } from "next/server";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { requireBetaAdmin, safeError } from "../_shared";

const FEEDBACK_FIELDS = "id,tester_id,user_id,feedback_type,feature_area,page_url,location_id,reservation_id,search_query,search_log_id,submitted_prompt,expected_result,actual_result,result_accuracy_rating,speed_rating,rating,message,screenshot_url,browser,device,turnstile_verified,status,admin_notes,reviewed_by,reviewed_at,created_at,updated_at,beta_session_id,beta_search_run_id,week_number,question_key,question_text,answer_value,answer_text,answer_options,result_mode,selected_none,test_mode" as const;
const FEEDBACK_STATUSES = new Set(["new", "reviewing", "actioned", "resolved", "closed", "dismissed"]);

export async function GET() {
  const auth = await requireBetaAdmin();
  if (auth.error) return auth.error;
  const { data, error } = await getAdminDatabaseClient().from("beta_feedback").select(FEEDBACK_FIELDS).order("created_at", { ascending: false }).limit(300);
  if (error) return safeError();
  return NextResponse.json({ success: true, feedback: data || [] });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireBetaAdmin();
  if (auth.error) return auth.error;
  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ success: false, error: "Feedback record is required." }, { status: 400 });
  const status = typeof body.status === "string" && FEEDBACK_STATUSES.has(body.status) ? body.status : undefined;
  const adminNotes = typeof body.admin_notes === "string" ? body.admin_notes.trim().slice(0, 4000) || null : undefined;
  if (status === undefined && adminNotes === undefined) return NextResponse.json({ success: false, error: "No review changes were provided." }, { status: 400 });
  const patch: Record<string, unknown> = { reviewed_by: auth.adminUser?.user_id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  if (status !== undefined) patch.status = status;
  if (adminNotes !== undefined) patch.admin_notes = adminNotes;
  const { data, error } = await getAdminDatabaseClient().from("beta_feedback").update(patch).eq("id", id).select(FEEDBACK_FIELDS).single();
  if (error) return safeError();
  return NextResponse.json({ success: true, feedback: data });
}
