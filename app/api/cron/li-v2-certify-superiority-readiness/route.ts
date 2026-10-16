import { supabaseAdmin } from "@/lib/supabase-admin";
import { evaluateLocationPublishability } from "@/lib/location-publishability";
import { refreshLocationClassificationV2 } from "@/lib/location-intelligence/v2/classification";
import { refreshLocationReadiness } from "@/lib/location-intelligence/v2/readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Protected maintenance action for the already imported, fixed TOH identity. */
export async function POST(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (process.env.PLATFORM_RUNTIME_PROVIDER !== "aws-background" ||
      request.headers.get("x-toh-aws-internal") !== "managed-dispatch" ||
      process.env.LI_V2_SINGLE_LOCATION_BOOTSTRAP_ENABLED !== "true")
    return Response.json({ ok: false, error: "private_aws_only" }, { status: 403 });
  const { confirmation } = await request.json().catch(() => ({ confirmation: "" }));
  if (confirmation !== "superiority-burger-119-avenue-a")
    return Response.json({ ok: false, error: "confirmation_required" }, { status: 400 });
  const locationId = "0f9c90fa-c73a-4d8b-970d-8c51bec9e968";
  const { data: location, error: locationError } = await supabaseAdmin.from("locations")
    .select("*").eq("id", locationId).single();
  if (locationError || !location || location.import_source !== "li_v2_independent")
    return Response.json({ ok: false, error: "imported_identity_not_verified" }, { status: 422 });
  const assessment = evaluateLocationPublishability(location, { allowApproval: true });
  if (!assessment.isSearchable || location.status !== "approved" ||
      location.duplicate_status !== "unique" || location.is_searchable !== true)
    return Response.json({ ok: false, error: "publishability_gate_failed", reasons: assessment.reasons }, { status: 422 });
  const readiness = await refreshLocationReadiness(locationId);
  if (!readiness.searchV3Ready || readiness.qualityScore < 85)
    return Response.json({ ok: false, error: "search_v3_readiness_gate_failed", readiness }, { status: 422 });
  if (location.publish_ready !== true) {
    const { data: updated, error: updateError } = await supabaseAdmin.from("locations")
      .update({ publish_ready: true }).eq("id", locationId)
      .eq("import_source", "li_v2_independent").eq("status", "approved")
      .eq("duplicate_status", "unique").eq("is_searchable", true)
      .eq("publish_ready", false).select("id,publish_ready").single();
    if (updateError || updated?.publish_ready !== true)
      return Response.json({ ok: false, error: "publish_ready_reconciliation_failed" }, { status: 422 });
  }
  const classification = await refreshLocationClassificationV2(locationId);
  if (!classification.publiclyDiscoverable)
    return Response.json({ ok: false, error: "classification_discoverability_gate_failed", readiness, classification }, { status: 422 });
  return Response.json({ ok: true, locationId, readiness, publiclyDiscoverable: classification.publiclyDiscoverable, searchV3RetrievalCertified: false });
}
