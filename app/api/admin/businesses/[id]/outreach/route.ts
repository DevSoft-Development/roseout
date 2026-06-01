import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.businessCrmSalesUpdate);
  if (error) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { data, error: qErr } = await supabaseAdmin.from("business_outreach").select("*").eq("location_id", id).order("updated_at", { ascending: false });
  if (qErr) return NextResponse.json({ outreach: [], warning: qErr.message });
  return NextResponse.json({ outreach: data || [] });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.businessCrmSalesUpdate);
  if (error) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const payload = {
    location_id: id,
    channel: body.channel || "email",
    outreach_status: body.outreach_status || "contacted",
    notes: body.notes || null,
    last_contacted_at: body.last_contacted_at || new Date().toISOString(),
    next_follow_up_at: body.next_follow_up_at || null,
  };
  const { data, error: iErr } = await supabaseAdmin.from("business_outreach").insert(payload).select("*").maybeSingle();
  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });
  return NextResponse.json({ outreach: data });
}
