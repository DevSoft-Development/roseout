import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { runInitialLocationEnrichmentV2 } from "@/lib/location-intelligence/v2/initial-enrichment";

export async function planInitialEnrichmentBatch(limit = 100) {
  const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
  const { data, error } = await supabaseAdmin
    .from("location_intelligence_profiles_v2")
    .select("location_id,last_initial_enrichment_at,locations!inner(is_searchable,popularity_score)")
    .is("last_initial_enrichment_at", null)
    .order("locations(popularity_score)", { ascending: false, nullsFirst: false })
    .limit(safeLimit);
  if (error) throw new Error(`Initial enrichment batch plan failed: ${error.message}`);
  return (data || []).map((row: any) => String(row.location_id));
}

export async function runInitialEnrichmentBatch(input: {
  limit?: number;
  execute?: boolean;
}) {
  const ids = await planInitialEnrichmentBatch(input.limit || 100);
  if (input.execute !== true) {
    return { planned: ids.length, executed: 0, locationIds: ids };
  }

  const results: Array<Record<string, unknown>> = [];
  for (const locationId of ids) {
    try {
      results.push(await runInitialLocationEnrichmentV2(locationId));
    } catch (error) {
      results.push({
        locationId,
        error: error instanceof Error ? error.message : "initial_enrichment_failed",
      });
    }
  }
  return {
    planned: ids.length,
    executed: results.length,
    failed: results.filter((row) => Boolean(row.error)).length,
    results,
  };
}
