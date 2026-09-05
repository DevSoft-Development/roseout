import { processLocationEnrichmentRun } from "@/lib/location-data-quality/enrichment-runner";
import { processWebsiteHoursDiscovery } from "@/lib/location-data-quality/website-hours-discovery";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV === "development";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function ensureGoogleEnrichmentKey() {
  if (!process.env.GOOGLE_PLACES_API_KEY?.trim()) {
    throw new Error("Google enrichment is not configured. Set GOOGLE_PLACES_API_KEY in production.");
  }
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Attach newly imported locations to the canonical enrichment run before
    // processing it. If a manual run currently owns the single-active-run slot,
    // the RPC leaves the inbox queued and the existing run proceeds unchanged.
    const { data: postImportAttach, error: postImportAttachError } = await supabaseAdmin.rpc(
      "attach_location_intelligence_inbox",
      { p_limit: 25 },
    );
    if (postImportAttachError) throw postImportAttachError;

    // Catalog enrichment may prepare data for Location Intelligence, but it must
    // never publish catalog rows during the guarded dedupe rollout. Publication
    // is intentionally isolated to the explicit cleanup workflow.
    ensureGoogleEnrichmentKey();
    const result = await processLocationEnrichmentRun();
    const websiteHours = await processWebsiteHoursDiscovery(5);
    return Response.json({ ...result, postImportAttach, websiteHours });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
