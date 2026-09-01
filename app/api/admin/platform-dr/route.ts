import { NextRequest, NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import {
  failbackPlatformDr,
  getPlatformDrStatus,
  platformDrConfigured,
  simulatePlatformDr,
  startPlatformDrLiveDrill,
} from "@/lib/aws/platform-dr-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LIVE_CONFIRMATION = "LIVE PLATFORM FAILOVER";

export async function GET() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.productionFinishLine);

  if (!platformDrConfigured()) {
    return NextResponse.json({
      ok: true,
      configured: false,
      confirmation: LIVE_CONFIRMATION,
      status: null,
    });
  }

  try {
    const status = await getPlatformDrStatus();
    return NextResponse.json({ ok: true, configured: true, confirmation: LIVE_CONFIRMATION, status });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      configured: true,
      confirmation: LIVE_CONFIRMATION,
      error: error instanceof Error ? error.message : "Unable to load platform DR status.",
    }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.productionFinishLine);

  if (!platformDrConfigured()) {
    return NextResponse.json({ ok: false, error: "Platform DR gateway is not configured." }, { status: 503 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "");

    if (action === "simulate") {
      return NextResponse.json({ ok: true, status: await simulatePlatformDr() });
    }

    if (action === "start_live") {
      const confirmation = String(body.confirmation || "");
      if (confirmation !== LIVE_CONFIRMATION) {
        return NextResponse.json({ ok: false, error: "Exact live failover confirmation phrase required." }, { status: 400 });
      }
      const requestedDuration = Number(body.durationSeconds || 120);
      const durationSeconds = Number.isFinite(requestedDuration)
        ? Math.max(60, Math.min(300, Math.round(requestedDuration)))
        : 120;
      return NextResponse.json({
        ok: true,
        status: await startPlatformDrLiveDrill({ confirmation, durationSeconds }),
      });
    }

    if (action === "failback") {
      const confirmation = String(body.confirmation || "");
      if (confirmation !== LIVE_CONFIRMATION) {
        return NextResponse.json({ ok: false, error: "Exact live failover confirmation phrase required." }, { status: 400 });
      }
      return NextResponse.json({
        ok: true,
        status: await failbackPlatformDr({ confirmation }),
      });
    }

    return NextResponse.json({ ok: false, error: "Unsupported platform DR action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Platform DR operation failed.",
    }, { status: 502 });
  }
}
