import { NextRequest, NextResponse } from "next/server";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { requireBetaAdmin, safeError } from "../_shared";

const TASK_FIELDS = "id,title,description,tester_type,feature_area,priority,status,due_at,test_url,button_label,estimated_minutes,instructions,reminder_enabled,prompt_mode,predefined_prompt,allow_custom_prompt,custom_prompt_required,created_by,created_at,updated_at,prompt_category_id,suggested_prompt,test_url_label,week_start,email_summary,approved_by,approved_at,sort_order,is_template" as const;
const ALLOWED_UPDATE_FIELDS = new Set(["title","description","tester_type","feature_area","priority","status","due_at","test_url","button_label","estimated_minutes","instructions","reminder_enabled","prompt_mode","predefined_prompt","allow_custom_prompt","custom_prompt_required","prompt_category_id","suggested_prompt","test_url_label","week_start","email_summary","sort_order","is_template"]);

function cleanString(value: unknown) {
  if (typeof value !== "string") return value;
  return value.trim() || null;
}

export async function GET(req: NextRequest) {
  const auth = await requireBetaAdmin();
  if (auth.error) return auth.error;
  const status = req.nextUrl.searchParams.get("status");
  let query = getAdminDatabaseClient().from("beta_tasks").select(TASK_FIELDS).order("created_at", { ascending: false }).limit(300);
  if (status === "archived") query = query.eq("status", "archived");
  else if (status === "draft") query = query.eq("status", "draft");
  else if (status === "active") query = query.eq("status", "active");
  else query = query.in("status", ["active", "draft"]);
  const { data, error } = await query;
  if (error) return safeError();
  return NextResponse.json({ success: true, tasks: data || [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireBetaAdmin();
  if (auth.error) return auth.error;
  try {
    const body = await req.json();
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 180) : "";
    if (!title) return NextResponse.json({ success: false, error: "Task title is required." }, { status: 400 });
    const payload = {
      title,
      description: typeof body.description === "string" ? body.description.trim().slice(0, 4000) || null : null,
      tester_type: typeof body.tester_type === "string" ? body.tester_type : "user",
      feature_area: typeof body.feature_area === "string" ? body.feature_area : "general",
      priority: typeof body.priority === "string" ? body.priority : "medium",
      status: typeof body.status === "string" ? body.status : "active",
      test_url: typeof body.test_url === "string" ? body.test_url.trim() || null : null,
      button_label: typeof body.button_label === "string" ? body.button_label.trim().slice(0, 80) || "Start Test" : "Start Test",
      estimated_minutes: Math.max(1, Math.min(240, Number(body.estimated_minutes || 5))),
      instructions: typeof body.instructions === "string" ? body.instructions.trim().slice(0, 8000) || null : null,
      prompt_mode: typeof body.prompt_mode === "string" ? body.prompt_mode : "predefined",
      predefined_prompt: typeof body.predefined_prompt === "string" ? body.predefined_prompt.trim().slice(0, 4000) || null : null,
      allow_custom_prompt: Boolean(body.allow_custom_prompt),
      custom_prompt_required: Boolean(body.custom_prompt_required),
      reminder_enabled: body.reminder_enabled !== false,
      created_by: auth.adminUser?.user_id,
    };
    const { data, error } = await getAdminDatabaseClient().from("beta_tasks").insert(payload).select(TASK_FIELDS).single();
    if (error) throw error;
    return NextResponse.json({ success: true, task: data });
  } catch (error) {
    console.error(error);
    return safeError();
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireBetaAdmin();
  if (auth.error) return auth.error;
  try {
    const body = await req.json();
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) return NextResponse.json({ success: false, error: "Task is required." }, { status: 400 });
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [key, value] of Object.entries(body)) {
      if (!ALLOWED_UPDATE_FIELDS.has(key)) continue;
      if (key === "estimated_minutes" || key === "sort_order") updates[key] = value == null || value === "" ? null : Number(value);
      else if (["reminder_enabled", "allow_custom_prompt", "custom_prompt_required", "is_template"].includes(key)) updates[key] = Boolean(value);
      else updates[key] = cleanString(value);
    }
    if (Object.keys(updates).length === 1) return NextResponse.json({ success: false, error: "No editable task fields were provided." }, { status: 400 });
    const { data, error } = await getAdminDatabaseClient().from("beta_tasks").update(updates).eq("id", id).select(TASK_FIELDS).single();
    if (error) throw error;
    return NextResponse.json({ success: true, task: data });
  } catch (error) {
    console.error(error);
    return safeError();
  }
}
