import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { createPosDeviceClaimCode } from "@/lib/pos/hardware/device-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  await requireAdminRole(["superadmin","admin"]);
  const body = await request.json().catch(() => ({}));
  try {
    const result = await createPosDeviceClaimCode({
      deviceId: String(body.deviceId || ""),
      ttlMinutes: Number(body.ttlMinutes || 60),
    });
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "pos_claim_code_create_failed" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
