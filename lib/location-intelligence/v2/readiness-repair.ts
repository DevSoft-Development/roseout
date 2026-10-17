import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { refreshLocationClassificationV2 } from "@/lib/location-intelligence/v2/classification";
import { refreshLocationReadiness } from "@/lib/location-intelligence/v2/readiness";
import { evaluateLocationPublishability } from "@/lib/location-publishability";

export async function repairLocationIntelligenceV2ReadinessBatch(limit = 50) {
  const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
  const { data, error } = await supabaseAdmin
    .from("location_intelligence_profiles_v2")
    .select("location_id,classification,search_v3_ready")
    .eq("search_v3_ready", false)
    .order("updated_at", { ascending: true, nullsFirst: true })
    .limit(safeLimit);
  if (error) throw new Error(`LI V2 readiness repair plan failed: ${error.message}`);

  const rows = data || [];
  const results: Array<Record<string, unknown>> = [];

  for (const row of rows) {
    const locationId = String((row as any).location_id || "");
    if (!locationId) continue;
    try {
      // Recompute old classifications rather than trusting stale exclusion flags.
      const classification = await refreshLocationClassificationV2(locationId);
      const readiness = await refreshLocationReadiness(locationId);
      const { data: location, error: locationError } = await supabaseAdmin.from("locations")
        .select("*").eq("id", locationId).single();
      if (locationError || !location) throw new Error("readiness_repair_location_lookup_failed");
      const assessment = evaluateLocationPublishability(location, { allowApproval: true });
      let publicationRepaired = false;
      if (location.import_source === "li_v2_independent" &&
          location.is_searchable === false && location.status === "approved" &&
          location.duplicate_status === "unique" &&
          classification.publiclyDiscoverable && readiness.searchV3Ready &&
          assessment.isSearchable) {
        const { data: updated, error: updateError } = await supabaseAdmin.from("locations")
          .update({ is_searchable: true, publish_ready: true })
          .eq("id", locationId).eq("import_source", "li_v2_independent")
          .eq("status", "approved").eq("duplicate_status", "unique")
          .eq("is_searchable", false).select("id").maybeSingle();
        if (updateError) throw new Error("readiness_publication_update_failed:" + updateError.message);
        publicationRepaired = Boolean(updated?.id);
      }
      results.push({
        locationId,
        repaired: true,
        classificationRefreshed: true,
        publicationRepaired,
        publishabilityReasons: assessment.reasons,
        searchV3Ready: readiness.searchV3Ready,
        qualityScore: readiness.qualityScore,
        classificationDomain: classification?.domain || null,
      });
    } catch (error) {
      results.push({
        locationId,
        repaired: false,
        error: error instanceof Error ? error.message : "readiness_repair_failed",
      });
    }
  }

  return {
    attempted: results.length,
    succeeded: results.filter((row) => row.repaired === true).length,
    failed: results.filter((row) => row.repaired === false).length,
    searchV3Ready: results.filter((row) => row.searchV3Ready === true).length,
    results,
  };
}
