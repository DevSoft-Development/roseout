import { NextRequest, NextResponse } from "next/server";
import {
  createLobbyDisplayPairing,
  listLobbyDisplays,
  revokeLobbyDisplay,
  updateLobbyDisplay,
} from "@/lib/reserve/lobbyDisplay";
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
  return NextResponse.json({
    success: true,
    displays: await listLobbyDisplays(canonicalLocationId),
    displayUrl: "https://reserve.theouthaven.com/display",
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const locationId = clean(body.locationId || body.location_id);
  if (!locationId) {
    return NextResponse.json({ success: false, error: "Missing location ID." }, { status: 400 });
  }
  const auth = await requireReservePermission(locationId, "manageTeam");
  if (auth.error) return auth.error;
  const canonicalLocationId = getReserveCanonicalLocationId(auth.access, locationId);
  const result = await createLobbyDisplayPairing({
    locationId: canonicalLocationId,
    label: clean(body.label) || "Lobby TV",
    createdByUserId: auth.user?.id || null,
    privacyMode: body.privacyMode === "anonymous" ? "anonymous" : "initials",
    showEstimatedWait: body.showEstimatedWait !== false,
    showReservationTime: body.showReservationTime !== false,
    showWaitlistPosition: body.showWaitlistPosition !== false,
    readyHoldMinutes: Number(body.readyHoldMinutes || 10),
    promoEnabled: Boolean(body.promoEnabled),
    promoMediaType: body.promoMediaType === "video" ? "video" : "image",
    promoMediaUrl: clean(body.promoMediaUrl) || null,
    promoHeadline: clean(body.promoHeadline) || null,
    promoBody: clean(body.promoBody) || null,
    promoLinkLabel: clean(body.promoLinkLabel) || null,
    promoLinkUrl: clean(body.promoLinkUrl) || null,
  });
  return NextResponse.json({
    success: true,
    display: result.display,
    pairingCode: result.code,
    displayUrl: "https://reserve.theouthaven.com/display",
  });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const locationId = clean(body.locationId || body.location_id);
  const displayId = clean(body.displayId || body.display_id);
  if (!locationId || !displayId) {
    return NextResponse.json({ success: false, error: "Missing display." }, { status: 400 });
  }
  const auth = await requireReservePermission(locationId, "manageTeam");
  if (auth.error) return auth.error;
  const canonicalLocationId = getReserveCanonicalLocationId(auth.access, locationId);
  const display = await updateLobbyDisplay(canonicalLocationId, displayId, body);
  return NextResponse.json({ success: true, display });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const locationId = clean(body.locationId || body.location_id);
  const displayId = clean(body.displayId || body.display_id);
  if (!locationId || !displayId) {
    return NextResponse.json({ success: false, error: "Missing display." }, { status: 400 });
  }
  const auth = await requireReservePermission(locationId, "manageTeam");
  if (auth.error) return auth.error;
  const canonicalLocationId = getReserveCanonicalLocationId(auth.access, locationId);
  await revokeLobbyDisplay(canonicalLocationId, displayId);
  return NextResponse.json({ success: true });
}
