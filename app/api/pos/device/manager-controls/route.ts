import { NextResponse } from "next/server";
import { authenticatePosDeviceCredential } from "@/lib/pos/device-command-service";
import {
  applyPosCheckDiscount,
  closePosCashDrawerSession,
  getPosManagerOperations,
  openPosCashDrawerSession,
  recordPosCashTender,
  refundPosTender,
  verifyPosManagerPin,
  voidPosOrderItem,
} from "@/lib/pos/payments/manager-service";

export const dynamic = "force-dynamic";

function bearer(request: Request) {
  const value = request.headers.get("authorization") || "";
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : "";
}

async function auth(request: Request) {
  return authenticatePosDeviceCredential({
    deviceId: String(request.headers.get("x-pos-device-id") || ""),
    credential: bearer(request),
  });
}

function statusFor(message: string) {
  if (/unauthorized|credential|pin_incorrect/.test(message)) return 401;
  if (/not_found/.test(message)) return 404;
  if (/approval_required|manager_not_found/.test(message)) return 403;
  if (/already_paid|not_payable|not_adjustable|not_refundable|exceeds_available|session_closed/.test(message)) return 409;
  if (/invalid|missing|required|insufficient|same/.test(message)) return 400;
  if (message.startsWith("operational_shard_")) return 503;
  return 500;
}

async function requireManagerApproval(locationId: string, body: any) {
  const approverStaffProfileId = String(body.approverStaffProfileId || body.approver_staff_profile_id || "");
  const managerPin = String(body.managerPin || body.manager_pin || "");
  await verifyPosManagerPin({
    locationId,
    approverStaffProfileId,
    pin: managerPin,
  });
  return approverStaffProfileId;
}

export async function GET(request: Request) {
  try {
    const device = await auth(request);
    const operations = await getPosManagerOperations(device.locationId);
    return NextResponse.json(
      { ok: true, operations },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "pos_manager_controls_failed";
    return NextResponse.json({ ok: false, error: message }, { status: statusFor(message) });
  }
}

export async function POST(request: Request) {
  try {
    const device = await auth(request);
    const body = (await request.json().catch(() => null)) as any;
    if (!body || typeof body !== "object") throw new Error("pos_manager_invalid_payload");
    const action = String(body.action || "");
    let result: any;

    if (action === "cash_tender") {
      result = await recordPosCashTender({
        locationId: device.locationId,
        checkId: String(body.checkId || ""),
        cashReceivedCents: Number(body.cashReceivedCents),
        amountCents: body.amountCents == null ? null : Number(body.amountCents),
        tipCents: Number(body.tipCents || 0),
        staffProfileId: body.actorStaffProfileId || null,
        deviceId: device.deviceId,
      });
    } else if (action === "discount") {
      const approverStaffProfileId = await requireManagerApproval(device.locationId, body);
      result = await applyPosCheckDiscount({
        locationId: device.locationId,
        checkId: String(body.checkId || ""),
        discountCents: Number(body.discountCents || 0),
        actorStaffProfileId: String(body.actorStaffProfileId || ""),
        approverStaffProfileId,
        reason: String(body.reason || ""),
      });
    } else if (action === "void_item") {
      const approverStaffProfileId = await requireManagerApproval(device.locationId, body);
      result = await voidPosOrderItem({
        locationId: device.locationId,
        orderItemId: String(body.orderItemId || ""),
        actorStaffProfileId: String(body.actorStaffProfileId || ""),
        approverStaffProfileId,
        reason: String(body.reason || ""),
      });
    } else if (action === "refund") {
      const approverStaffProfileId = await requireManagerApproval(device.locationId, body);
      result = await refundPosTender({
        locationId: device.locationId,
        tenderId: String(body.tenderId || ""),
        amountCents: Number(body.amountCents || 0),
        actorStaffProfileId: String(body.actorStaffProfileId || ""),
        approverStaffProfileId,
        reason: String(body.reason || ""),
        idempotencyKey: String(body.idempotencyKey || ""),
      });
    } else if (action === "drawer_open") {
      result = await openPosCashDrawerSession({
        locationId: device.locationId,
        deviceId: device.deviceId,
        staffProfileId: body.actorStaffProfileId || null,
        openingCashCents: Number(body.openingCashCents || 0),
      });
    } else if (action === "drawer_close") {
      await requireManagerApproval(device.locationId, body);
      result = await closePosCashDrawerSession({
        locationId: device.locationId,
        sessionId: String(body.sessionId || ""),
        countedCashCents: Number(body.countedCashCents || 0),
      });
    } else {
      throw new Error("pos_manager_invalid_action");
    }

    return NextResponse.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "pos_manager_controls_failed";
    return NextResponse.json({ ok: false, error: message }, { status: statusFor(message) });
  }
}
