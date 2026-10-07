import { NextRequest, NextResponse } from "next/server";
import { authenticatePosDeviceCredential } from "@/lib/pos/hardware/device-auth";
import { listLocationHardware } from "@/lib/pos/hardware/device-registry";
import {
  claimNextOnlineOrderFulfillment,
  finishOnlineOrderFulfillment,
} from "@/lib/pos/online-ordering/fulfillment";
import { setOnlineOrderStatus } from "@/lib/pos/online-ordering/status";

export const runtime = "nodejs";

function bearer(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : "";
}

async function auth(request: NextRequest) {
  return authenticatePosDeviceCredential({
    bearerToken: bearer(request),
    deviceId: request.headers.get("x-pos-device-id"),
  });
}

export async function GET(request: NextRequest) {
  try {
    const device = await auth(request);
    if (request.nextUrl.searchParams.get("action") === "routes") {
      const hardware = await listLocationHardware(device.locationId);
      return NextResponse.json({
        ok: true,
        routes: hardware
          .filter((entry) => entry.device.device_type === "receipt_printer" || entry.device.device_type === "kitchen_printer" || entry.device.device_type === "cash_drawer")
          .map((entry) => ({
            role: entry.role,
            stationKey: entry.stationKey,
            deviceId: entry.deviceId,
            identity: {
              vendor: entry.device.vendor,
              model: entry.device.model,
              serialNumber: entry.device.serial_number,
              provider: entry.device.provider,
              providerDeviceId: entry.device.provider_device_id,
              networkIdentifiers: Array.isArray(entry.device.metadata?.network_identifiers)
                ? entry.device.metadata.network_identifiers
                : [],
            },
          })),
      }, { headers: { "Cache-Control": "no-store" } });
    }
    const dispatch = await claimNextOnlineOrderFulfillment({
      locationId: device.locationId,
      deviceId: device.deviceId,
    });
    return NextResponse.json({ ok: true, dispatch }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "pos_order_inbox_failed";
    const status = /credential|missing/.test(message) ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: NextRequest) {
  try {
    const device = await auth(request);
    const body = await request.json().catch(() => ({}));
    if (body.action === "status") {
      const next = String(body.status || "");
      if (!["accepted","preparing","ready","completed","canceled"].includes(next)) {
        return NextResponse.json({ ok: false, error: "online_order_status_invalid" }, { status: 400 });
      }
      const result = await setOnlineOrderStatus({
        locationId: device.locationId,
        onlineOrderId: String(body.onlineOrderId || ""),
        status: next as "accepted" | "preparing" | "ready" | "completed" | "canceled",
        actorType: "device",
        actorId: device.deviceId,
      });
      return NextResponse.json({ ok: true, order: result }, { headers: { "Cache-Control": "no-store" } });
    }
    await finishOnlineOrderFulfillment({
      locationId: device.locationId,
      deviceId: device.deviceId,
      dispatchId: String(body.dispatchId || ""),
      success: body.success === true,
      error: typeof body.error === "string" ? body.error : null,
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "pos_order_inbox_ack_failed";
    const status = /credential|missing/.test(message) ? 401 : 400;
    return NextResponse.json({ ok: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
