import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getPhotoPublishabilityUpdates } from "@/lib/location-growth/repairPhotoPublishability";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ locationId: string }> },
) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.crmEdit);

  const { locationId } = await params;

  const { data: location, error: fetchError } = await supabaseAdmin
    .from("locations")
    .select("*")
    .eq("id", locationId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
  }

  if (!location) {
    return NextResponse.json({ ok: false, error: "Location not found." }, { status: 404 });
  }

  const updates = getPhotoPublishabilityUpdates(location);

  const { error: updateError } = await supabaseAdmin
    .from("locations")
    .update(updates)
    .eq("id", locationId);

  if (updateError) {
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updates });
}
