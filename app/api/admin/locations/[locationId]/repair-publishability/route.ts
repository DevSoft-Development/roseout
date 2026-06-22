import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getPhotoPublishabilityUpdates } from "@/lib/location-growth/repairPhotoPublishability";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ locationId: string }> },
) {
  const { error: authError } = await requireSuperAdmin();
  if (authError) return authError;

  const { locationId } = await params;

  const { data: location, error: fetchError } = await supabaseAdmin
    .from("locations")
    .select("*")
    .eq("id", locationId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ success: false, action: "repair_publishability", error: "Location could not be loaded." }, { status: 500 });
  }

  if (!location) {
    return NextResponse.json({ success: false, action: "repair_publishability", error: "Location not found." }, { status: 404 });
  }

  const updates = getPhotoPublishabilityUpdates(location);

  const { error: updateError } = await supabaseAdmin
    .from("locations")
    .update(updates)
    .eq("id", locationId);

  if (updateError) {
    return NextResponse.json({ success: false, action: "repair_publishability", error: "Location could not be repaired." }, { status: 500 });
  }

  return NextResponse.json({ success: true, action: "repair_publishability", counts: { updated: Object.keys(updates).length }, updates });
}
