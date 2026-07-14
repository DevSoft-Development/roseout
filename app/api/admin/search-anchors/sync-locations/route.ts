import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { syncApprovedLocationsToSearchAnchors } from "@/lib/search/anchors/sync";

const roles = ["superadmin", "admin", "manager"] as const;

function validateBody(body: any) {
  if (!body || body.mode === undefined || body.mode === "all") return { mode: "all" as const };
  if (body.mode === "location_ids") {
    if (!Array.isArray(body.locationIds) || body.locationIds.length < 1 || body.locationIds.length > 100 || body.locationIds.some((id: unknown) => typeof id !== "string" || !id.trim())) throw new Error("locationIds must be a non-empty string array with at most 100 IDs");
    return { mode: "location_ids" as const, locationIds: body.locationIds.map((id: string) => id.trim()) };
  }
  if (body.mode === "market") {
    if (typeof body.market !== "string" || !/^[A-Z0-9_ -]{2,40}$/i.test(body.market)) throw new Error("market is required for market sync");
    return { mode: "market" as const, market: body.market.trim().toUpperCase() };
  }
  throw new Error("Unsupported sync mode");
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminApiRole(roles);
  if (auth.error) return auth.error;
  let options;
  try { options = validateBody(await req.json().catch(() => ({ mode: "all" }))); }
  catch (error: any) { return NextResponse.json({ success: false, error: error.message }, { status: 400 }); }
  try {
    const result = await syncApprovedLocationsToSearchAnchors(supabaseAdmin, options);
    return NextResponse.json({ success: true, ...result, result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Sync failed" }, { status: 500 });
  }
}
