import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { refreshLocationClassificationV2 } from "@/lib/location-intelligence/v2/classification";
import { refreshLocationReadiness } from "@/lib/location-intelligence/v2/readiness";

export async function repairLocationIntelligenceV2ReadinessBatch(limit = 50) {
  const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
  const { data, error } = await supabaseAdmin
    .from("location_intelligence_profiles_v2")
    .select("location_id,classification,search_v3_ready")
    .eq("search_v3_ready", false)
    .limit(safeLimit);
  if (error) throw new Error(`LI V2 readiness repair plan failed: ${error.message}`);

  const rows = (data || []).filter((row: any) =>
    row?.classification?.negativeClassificationKnown !== true
  );
  const results: Array<Record<string, unknown>> = [];

  for (const row of rows) {
    const locationId = String((row as any).location_id || "");
    if (!locationId) continue;
    try {
      const classification = await refreshLocationClassificationV2(locationId);
      const readiness = await refreshLocationReadiness(locationId);
      results.push({
        locationId,
        repaired: true,
        searchV3Ready: readiness.searchV3Ready,
        qualityScore: readiness.qualityScore,
        classificationDomain: classification.domain,
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
