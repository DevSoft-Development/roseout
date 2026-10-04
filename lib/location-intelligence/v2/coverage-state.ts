import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { coveragePriority, type CoverageInventory } from "@/lib/location-intelligence/v2/coverage";

export async function persistCoverageState(input: {
  market: string;
  areaType: string;
  areaKey: string;
  locationKind: string;
  rows: CoverageInventory[];
}) {
  const now = new Date().toISOString();
  const payload = input.rows.map((row) => ({
    market: input.market,
    area_type: input.areaType,
    area_key: input.areaKey,
    location_kind: input.locationKind,
    category: row.category,
    current_count: row.current,
    target_count: row.target,
    search_demand: Number(row.searchDemand || 0),
    result_gap_rate: Number(row.resultGapRate || 0),
    priority_score: coveragePriority(row),
    calculated_at: now,
  }));
  if (!payload.length) return [];
  const { data, error } = await supabaseAdmin
    .from("location_coverage_state")
    .upsert(payload, { onConflict: "market,area_type,area_key,location_kind,category" })
    .select("*");
  if (error) throw new Error(`Coverage state persist failed: ${error.message}`);
  return data || [];
}
