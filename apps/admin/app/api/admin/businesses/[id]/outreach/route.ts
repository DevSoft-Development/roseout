import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

const OUTREACH_FIELDS = "id,outreach_status,outreach_notes,last_contacted_at,follow_up_date,updated_at" as const;
const STATUSES = new Set(["not_contacted", "contacted", "follow_up", "interested", "not_interested", "converted", "do_not_contact"]);

function asIso(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.businessCrmSalesUpdate);
  if (auth.error) return auth.error;
  const { id } = await params;
  const { data, error } = await supabaseAdmin.from("locations").select(OUTREACH_FIELDS).eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ outreach: [], warning: error.message });
  return NextResponse.json({ outreach: data ? [data] : [] });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.businessCrmSalesUpdate);
  if (auth.error) return auth.error;
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const requestedStatus = String(body.outreach_status || "contacted").trim().toLowerCase();
  const outreachStatus = STATUSES.has(requestedStatus) ? requestedStatus : "contacted";
  const outreachNotes = String(body.notes ?? body.outreach_notes ?? "").trim().slice(0, 5000) || null;
  const lastContactedAt = asIso(body.last_contacted_at) ?? new Date().toISOString();
  const followUpDate = asIso(body.next_follow_up_at ?? body.follow_up_date);

  const { data, error } = await supabaseAdmin
    .from("locations")
    .update({
      outreach_status: outreachStatus,
      outreach_notes: outreachNotes,
      last_contacted_at: lastContactedAt,
      follow_up_date: followUpDate,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(OUTREACH_FIELDS)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ outreach: data });
}
