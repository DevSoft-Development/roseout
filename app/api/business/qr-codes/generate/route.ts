import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { generateMissingLocationQrs } from "@/lib/qr/locationQr";
import { requireOwnerOrAdminAccessToLocation } from "@/lib/auth/locationOwnerAccess";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const locationId = body.locationId || body.adminLocationId ? String(body.locationId || body.adminLocationId) : undefined;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (locationId) {
    const access = await requireOwnerOrAdminAccessToLocation(user.id, locationId);
    if (!access) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    const selectedLocationId = String(access.location.id || locationId);
    const result = await generateMissingLocationQrs(1, [selectedLocationId]);
    return NextResponse.json({ success: true, message: "QR codes are ready for this location.", locationId: selectedLocationId, result });
  }
  return NextResponse.json({ success: false, error: "Missing selected location id" }, { status: 400 });
}
