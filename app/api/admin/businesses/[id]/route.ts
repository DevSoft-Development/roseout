import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.businessCrm);
  if (error) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const [loc, crm] = await Promise.all([
    supabaseAdmin.from("locations").select("*").eq("id", id).maybeSingle(),
    supabaseAdmin.from("business_crm_snapshot").select("*").eq("id", id).maybeSingle(),
  ]);
  return NextResponse.json({ location: loc.data || null, crm: crm.data || null });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.businessCrm);
  if (error) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};
  for (const key of ["name", "phone", "website", "category", "cuisine", "reservation_url", "reservation_link"]) {
    if (key in body) updates[key] = body[key];
  }
  const { data, error: updateError } = await supabaseAdmin.from("locations").update(updates).eq("id", id).select("*").maybeSingle();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ location: data });
}
