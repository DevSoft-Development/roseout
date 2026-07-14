import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildSearchAnchorSyncPreview } from "@/lib/search/anchors/syncPreview";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireAdminApiRole(["superadmin", "admin", "manager"]);
  if (auth.error) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));
    const mode = body?.mode || "all";
    const scope = mode === "market"
      ? { mode, market: String(body.market || "") }
      : mode === "location_ids"
        ? { mode, locationIds: Array.isArray(body.locationIds) ? body.locationIds : [] }
        : { mode };

    if (mode === "market" && !scope.market) {
      return Response.json({ success: false, error: "Market is required." }, { status: 400