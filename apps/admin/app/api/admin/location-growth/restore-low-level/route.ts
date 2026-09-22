import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { error: authError } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.locationGrowth);
  if (authError) return authError;

  const body = await request.json().catch(() => ({}));
  const locationId = String(body.location_id || body.locationId || "").trim();
  if (!locationId) return NextResponse.json({ success: false, error: "Missing location_id" }, { status: 400 });

  const { data, error } = await supabaseAdmin.rpc("oh_restore_location_from_low_level", { p_location_id: locationId });
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, result: data });
}
