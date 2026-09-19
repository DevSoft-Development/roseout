import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

const CONTENT_TEST_FIELDS = "id,application_id,prompt,submission_text,submission_url,score,review_notes,status,created_at,updated_at";
const ALLOWED_CREATE_FIELDS = new Set(["application_id","prompt","submission_text","submission_url","score","review_notes","status"]);

export async function GET() {
  try {
    await requireAdminRole(ADMIN_PAGE_ACCESS.careers);
    const { data } = await supabaseAdmin.from("career_content_tests").select(CONTENT_TEST_FIELDS).limit(100);
    return NextResponse.json({ records: data || [] });
  } catch {
    return NextResponse.json({ error: "We could not load these careers records." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await requireAdminRole(ADMIN_PAGE_ACCESS.careersEdit);
    const body = await req.json().catch(() => ({}));
    const record: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) if (ALLOWED_CREATE_FIELDS.has(key)) record[key] = value;
    if (!record.application_id) return NextResponse.json({ error: "Application is required." }, { status: 400 });
    if (typeof record.prompt === "string") record.prompt = record.prompt.trim().slice(0, 4000);
    if (typeof record.submission_text === "string") record.submission_text = record.submission_text.trim().slice(0, 12000);
    if (typeof record.review_notes === "string") record.review_notes = record.review_notes.trim().slice(0, 4000);
    const { data, error } = await supabaseAdmin.from("career_content_tests").insert(record).select(CONTENT_TEST_FIELDS).single();
    if (error) return NextResponse.json({ error: "We could not save this careers record." }, { status: 400 });
    return NextResponse.json({ record: data });
  } catch {
    return NextResponse.json({ error: "We could not save this careers record." }, { status: 500 });
  }
}
