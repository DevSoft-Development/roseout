import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

const NOTE_FIELDS = "id,location_id,note_type,note_body,changed_from,changed_to,actor_user_id,created_at" as const;
const NOTE_TYPES = new Set(["general", "call", "email", "sms", "visit", "internal"]);

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.businessCrmSalesUpdate);
  if (auth.error) return auth.error;
  const { id } = await params;
  const { data, error } = await supabaseAdmin
    .from("business_crm_notes")
    .select(NOTE_FIELDS)
    .eq("location_id", id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ notes: [], warning: error.message });
  return NextResponse.json({ notes: data || [] });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.businessCrmSalesUpdate);
  if (auth.error) return auth.error;
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const noteBody = String(body.note_body ?? body.note ?? "").trim().slice(0, 5000);
  if (!noteBody) return NextResponse.json({ error: "Note is required." }, { status: 400 });
  const requestedType = String(body.note_type || "general").trim().toLowerCase();
  const noteType = NOTE_TYPES.has(requestedType) ? requestedType : "general";
  const { data, error } = await supabaseAdmin
    .from("business_crm_notes")
    .insert({
      location_id: id,
      note_body: noteBody,
      note_type: noteType,
      actor_user_id: auth.adminUser?.user_id ?? null,
    })
    .select(NOTE_FIELDS)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ note: data });
}
