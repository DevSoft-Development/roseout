import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import {
  getLaunchCatalogHealth,
  runDescriptionBackfillBatch,
  type DescriptionBackfillPhase,
} from "@/lib/admin/location-launch-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.dataQuality);
  if (auth.error) return auth.error;
  try {
    const health = await getLaunchCatalogHealth();
    return NextResponse.json({ success: true, health });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.dataQuality);
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => ({}));
  const phase: DescriptionBackfillPhase = body?.phase === "hidden" ? "hidden" : "public";
  const limit = Math.max(1, Math.min(Number(body?.limit || 10), 25));

  try {
    const batch = await runDescriptionBackfillBatch({ phase, limit });
    const health = await getLaunchCatalogHealth();
    return NextResponse.json({ success: true, batch, health });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 409 });
  }
}
