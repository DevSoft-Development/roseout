import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { runGoogleCuratedDiscovery } from "@/lib/location-growth/googleCuratedDiscovery";
import type { GoogleDiscoveryKind } from "@/lib/location-growth/googleDiscoveryQuality";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function authorize(request: NextRequest) {
  if (process.env.NODE_ENV === "development") return null;
  if (
    process.env.IMPORT_SECRET &&
    request.headers.get("x-internal-import-secret") === process.env.IMPORT_SECRET
  ) {
    return null;
  }
  const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.locationGrowth);
  return error;
}

function bounded(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(numeric)));
}

export async function POST(request: NextRequest) {
  const authError = await authorize(request);
  if (authError) return authError;

  try {
    const body = await request.json().catch(() => ({}));
    const kind: GoogleDiscoveryKind = body.kind === "activity" ? "activity" : "restaurant";
    const result = await runGoogleCuratedDiscovery({
      kind,
      maxPlans: bounded(body.maxPlans, 4, 1, 10),
      resultsPerPlan: bounded(body.resultsPerPlan, 6, 1, 12),
      maxCandidates: bounded(body.maxCandidates, 24, 1, 80),
      maxRuntimeMs: bounded(body.maxRuntimeMs, 180_000, 30_000, 270_000),
      autoPublish: body.autoPublish !== false,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[location-growth/google-curated-discovery]", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
