import { NextRequest, NextResponse } from "next/server";
import {
  listReserveAuthorizedDevices,
  revokeReserveAuthorizedDevice,
} from "@/lib/reserve/deviceAuthorization";
import {
  getReserveCanonicalLocationId,
  requireReservePermission,
} from "@/lib/reserve/locationPermissions";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: NextRequest) {
  const locationId = clean(request.nextUrl.searchParams.get("locationId"));
  if (!locationId) {
    return NextResponse.json({ success: false, error: "Missing location ID." }, { status: 400 });
  }

  const auth = await requireReservePermission(locationId, "manageTeam");
  if (auth.error) return auth.error;
  const canonicalLocationId = getReserveCanonicalLocationId(auth.access, locationId);
  const devices = await listReserveAuthorizedDevices(canonicalLocationId);

  return NextResponse.json(
    { success: true, devices },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const locationId = clean(body.locationId || body.location_id);
  const deviceId = clean(body.deviceId || body.device_id);
  if (!locationId || !deviceId) {
    return NextResponse.json({ success: false, error: "Missing device." }, { status: 400 });
  }

  const auth = await requireReservePermission(locationId, "manageTeam");
  if (auth.error) return auth.error;
  const canonicalLocationId = getReserveCanonicalLocationId(auth.access, locationId);
  await revokeReserveAuthorizedDevice(canonicalLocationId, deviceId);

  return NextResponse.json({ success: true });
}
