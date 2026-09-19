import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { validateNewYorkHiringText } from "@/lib/careers/new-york-compliance";
import { supabaseAdmin } from "@/lib/supabase-admin";

const OFFER_FIELDS = "id,application_id,job_id,status,employment_type,pay_type,compensation_text,start_date,expires_at,sent_at,accepted_at,declined_at,withdrawn_at,created_by,created_at,updated_at" as const;
const ALLOWED_EDIT_FIELDS = new Set(["employment_type", "pay_type", "compensation_text", "start_date", "expires_at"]);

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminRole(ADMIN_PAGE_ACCESS.careers);
    const { id } = await params;
    const { data, error } = await supabaseAdmin.from("career_offers").select(OFFER_FIELDS).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Record not found." }, { status: 404 });
    return NextResponse.json({ record: data });
  } catch {
    return NextResponse.json({ error: "We could not load this careers record." }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminRole(ADMIN_PAGE_ACCESS.careersEdit);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    if (Object.prototype.hasOwnProperty.call(body, "status") || Object.prototype.hasOwnProperty.call(body, "accepted_at") || Object.prototype.hasOwnProperty.call(body, "sent_at")) {
      return NextResponse.json({ error: "Use the guided Hiring Workflow to send, accept, decline, or finalize offers so New York safeguards and the audit trail are enforced." }, { status: 400 });
    }

    const issue = validateNewYorkHiringText(body.compensation_text);
    if (issue) return NextResponse.json({ error: issue.message, compliance: "new_york", code: issue.key }, { status: 400 });

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [key, value] of Object.entries(body)) if (ALLOWED_EDIT_FIELDS.has(key)) patch[key] = typeof value === "string" ? value.trim() || null : value;
    if (typeof patch.compensation_text === "string") patch.compensation_text = patch.compensation_text.slice(0, 1000);
    if (Object.keys(patch).length === 1) return NextResponse.json({ error: "No editable fields were provided." }, { status: 400 });

    const { data, error } = await supabaseAdmin.from("career_offers").update(patch).eq("id", id).select(OFFER_FIELDS).single();
    if (error) return NextResponse.json({ error: "We could not update this careers record." }, { status: 400 });
    return NextResponse.json({ record: data });
  } catch (error) {
    console.error("career offer update failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "We could not update this careers record." }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminRole(ADMIN_PAGE_ACCESS.careersEdit);
    const { id } = await params;
    const { error } = await supabaseAdmin.from("career_offers").update({ status: "archived", updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "We could not archive this careers record." }, { status: 500 });
  }
}
