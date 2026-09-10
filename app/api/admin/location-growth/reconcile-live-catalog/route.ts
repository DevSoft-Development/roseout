import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import {
  reconcileImportedUnverified,
  reconcilePublishReadyNonSearchable,
  resolveLiveDuplicateBacklog,
} from "@/lib/location-growth/liveCatalogReconciliation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Mode = "imported_unverified" | "duplicates" | "publish_ready" | "all";

export async function POST(request: NextRequest) {
  const { error: authError } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.locationGrowth);
  if (authError) return authError;

  const body = await request.json().catch(() => ({}));
  const mode = String(body.mode || "all") as Mode;
  const dryRun = body.dryRun !== false;
  const limit = Number(body.limit || 1000);

  if (!["imported_unverified", "duplicates", "publish_ready", "all"].includes(mode)) {
    return NextResponse.json({ success: false, error: "Invalid reconciliation mode." }, { status: 400 });
  }

  try {
    const result: Record<string, unknown> = {};
    if (mode === "imported_unverified" || mode === "all") {
      result.importedUnverified = await reconcileImportedUnverified({ limit, dryRun });
    }
    if (mode === "duplicates" || mode === "all") {
      result.duplicates = await resolveLiveDuplicateBacklog({ limit: Math.min(limit, 500), dryRun });
    }
    if (mode === "publish_ready" || mode === "all") {
      result.publishReady = await reconcilePublishReadyNonSearchable({ limit: Math.min(limit, 500), dryRun });
    }

    return NextResponse.json({ success: true, mode, dryRun, result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Live catalog reconciliation failed." },
      { status: 500 },
    );
  }
}
