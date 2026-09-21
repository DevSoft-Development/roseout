import { NextRequest, NextResponse } from "next/server";
import {
  authorizeReserveDevice,
  getReserveAuthorizedDevice,
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

  const view = await requireReservePermission(locationId, "viewDashboard");
  if (view.error) return view.error;
  const canonicalLocationId = getReserveCanonicalLocationId(view.access, locationId);
  const current = await getReserveAuthorizedDevice(canonicalLocationId);
  const canManage = Boolean(view.access?.permissions?.manageTeam);

  return NextResponse.json({
    success: true,
    currentDevice: current,
    canManage,
    devices: canManage ? await listReserveAuthorizedDevices(canonicalLocationId) : [],
  }, { headers: { "Cache-Control": "no-store", "X-TheOutHaven-API-Lane": "reserve-v1" } });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const locationId = clean(body.locationId || body.location_id);
  if (!locationId) {
    return NextResponse.json({ success: false, error: "Missing location ID." }, { status: 400 });
  }

  const auth = await requireReservePermission(locationId, "manageTeam");
  if (auth.error) return auth.error;
  const canonicalLocationId = getReserveCanonicalLocationId(auth.access, locationId);

  const device = await authorizeReserveDevice({
    locationId: canonicalLocationId,
    label: clean(body.label) || "Reserve front desk",
    authorizedByUserId: auth.user?.id || null,
  });

  return NextResponse.json({ success: true, device });
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
