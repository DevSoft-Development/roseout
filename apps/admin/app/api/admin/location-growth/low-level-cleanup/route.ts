import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const { error: authError } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.locationGrowth);
  if (authError) return authError;

  const { data, error } = await supabaseAdmin.rpc("oh_cleanup_low_level_locations");
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, result: data });
}
