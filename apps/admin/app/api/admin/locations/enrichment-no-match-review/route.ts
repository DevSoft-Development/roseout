import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReviewStatus = "open" | "reviewed" | "needs_source_repair" | "manual_review";

const REVIEW_ACTIONS = new Set<ReviewStatus>([
  "open",
  "reviewed",
  "needs_source_repair",
  "manual_review",
]);

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

export async function GET() {
  const auth = await requireAdminApiRole(["superadmin", "admin", "manager"]);
  if (auth.error) return auth.error;

  const { data: rawItems, error: itemsError } = await supabaseAdmin
    .from("location_enrichment_run_items")
    .select("id,run_id,location_id,status,api_calls,attempts,completed_at,match_diagnostics")
    .eq("status", "no_match")
    .order("completed_at", { ascending: false })
    .limit(250);

  if (itemsError) {
    return Response.json({ success: false, error: itemsError.message }, { status: 500 });
  }

  const items = (rawItems || []).filter((item) => {
    const diagnostics = asObject(item.match_diagnostics);
    return diagnostics.version === "google-match-diagnostics-v2" && diagnostics.disposition;
  });

  const locationIds = [...new Set(items.map((item) => item.location_id).filter(Boolean))];
  const locationMap = new Map<string, Record<string, unknown>>();

  if (locationIds.length) {
    const { data: locations, error: locationsError } = await supabaseAdmin
      .from("locations")
      .select("id,name,address,city,state,market,google_enrichment_status,google_enriched_at")
      .in("id", locationIds);

    if (locationsError) {
      return Response.json({ success: false, error: locationsError.message }, { status: 500 });
    }

    for (const location of locations || []) locationMap.set(location.id, location);
  }

  const rows = items.map((item) => {
    const diagnostics = asObject(item.match_diagnostics);
    const review = asObject(diagnostics.review);
    return {
      id: item.id,
      runId: item.run_id,
      locationId: item.location_id,
      completedAt: item.completed_at,
      apiCalls: item.api_calls,
      attempts: item.attempts,
      location: locationMap.get(item.location_id) || null,
      confidence: Number(diagnostics.confidence || 0),
      candidate: diagnostics.candidate || null,
      evidence: diagnostics.evidence || {},
      disposition: diagnostics.disposition || null,
      review: {
        status: REVIEW_ACTIONS.has(review.status as ReviewStatus) ? review.status : "open",
        note: typeof review.note === "string" ? review.note : "",
        reviewedAt: typeof review.reviewedAt === "string" ? review.reviewedAt : null,
        reviewedBy: typeof review.reviewedBy === "string" ? review.reviewedBy : null,
      },
    };
  });

  const counts = rows.reduce<Record<string, number>>((acc, row) => {
    const key = String(row.disposition?.category || "unresolved");
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return Response.json({ success: true, rows, counts });
}

export async function POST(req: Request) {
  const auth = await requireAdminApiRole(["superadmin", "admin"]);
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const itemId = String(body.itemId || "").trim();
  const status = String(body.status || "").trim() as ReviewStatus;
  const note = String(body.note || "").trim().slice(0, 1000);

  if (!itemId) {
    return Response.json({ success: false, error: "itemId is required." }, { status: 400 });
  }
  if (!REVIEW_ACTIONS.has(status)) {
    return Response.json({ success: false, error: "Unsupported review status." }, { status: 400 });
  }

  const { data: item, error: itemError } = await supabaseAdmin
    .from("location_enrichment_run_items")
    .select("id,status,match_diagnostics")
    .eq("id", itemId)
    .maybeSingle();

  if (itemError) return Response.json({ success: false, error: itemError.message }, { status: 500 });
  if (!item) return Response.json({ success: false, error: "No-match item not found." }, { status: 404 });
  if (item.status !== "no_match") {
    return Response.json({ success: false, error: "Only no-match items can be reviewed here." }, { status: 409 });
  }

  const diagnostics = asObject(item.match_diagnostics);
  if (diagnostics.version !== "google-match-diagnostics-v2" || !diagnostics.disposition) {
    return Response.json({ success: false, error: "This item does not have v2 disposition diagnostics." }, { status: 409 });
  }

  const now = new Date().toISOString();
  const nextDiagnostics = {
    ...diagnostics,
    review: {
      status,
      note,
      reviewedAt: status === "open" ? null : now,
      reviewedBy: status === "open" ? null : auth.adminUser?.user_id || null,
    },
  };

  const { error: updateError } = await supabaseAdmin
    .from("location_enrichment_run_items")
    .update({ match_diagnostics: nextDiagnostics, updated_at: now })
    .eq("id", itemId)
    .eq("status", "no_match");

  if (updateError) return Response.json({ success: false, error: updateError.message }, { status: 500 });

  return Response.json({ success: true, itemId, review: nextDiagnostics.review });
}
