import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { executeApprovedAnchorBackfill } from "@/lib/search/anchors/backfill";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireAdminApiRole(["superadmin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const runId = String(body?.runId || "");
    const batchSize = Number(body?.batchSize || 100);
    if (!runId) return Response.json({ success: false, error: "runId is required." }, { status: 400 });
    const result = await executeApprovedAnchorBackfill(runId, batchSize);
    return Response.json({ success: true, ...result });
  } catch (error: any) {
    console.error("search_anchor_backfill_failed", error);
    return Response.json({ success: false, error: error?.message || "Backfill execution failed." }, { status: 500 });
  }
}
