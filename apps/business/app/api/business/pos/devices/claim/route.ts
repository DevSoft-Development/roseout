import { NextResponse } from "next/server";
import { claimPosDeviceCredential } from "@/lib/pos/hardware/device-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  try {
    const result = await claimPosDeviceCredential({
      deviceId: String(body.deviceId || ""),
      claimCode: String(body.claimCode || body.pairingCode || ""),
      installationId: String(body.installationId || ""),
    });
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "pos_device_claim_failed";
    const status = /invalid|missing|not_assigned/.test(message) ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
