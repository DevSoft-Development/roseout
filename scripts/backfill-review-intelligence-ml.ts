import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { deriveReviewProfileSignals } from "@/lib/search/reviewIntelligenceProfileSignals";

const PAGE_SIZE = 1000;
const UPSERT_BATCH = 100;

async function existingMlIds(locationIds: string[]) {
  const existing = new Set<string>();
  for (let index = 0; index < locationIds.length; index += 100) {
    const chunk = locationIds.slice(index, index + 100);
    const { data, error } = await supabaseAdmin
      .from("location_review_ml_features")
      .select("location_id")
      .in("location_id", chunk);
    if (error) throw error;
    for (const row of data ?? []) existing.add(String(row.location_id));
  }
  return existing;
}

async function main() {
  const byLocation = new Map<string, any[]>();

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from("location_review_intelligence")
      .select("location_id,concept,lifetime_count,trailing_12m_count,trailing_90d_count,positive_ratio,negative_ratio,confidence,trend,evidence,updated_at")
      .order("location_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      const locationId = String(row.location_id ?? "");
      if (!locationId) continue;
      const rows = byLocation.get(locationId) ?? [];
      rows.push(row);
      byLocation.set(locationId, rows);
    }

    if (data.length < PAGE_SIZE) break;
  }

  const locationIds = [...byLocation.keys()];
  const existing = await existingMlIds(locationIds);
  const rows = locationIds
    .filter((locationId) => !existing.has(locationId))
    .map((locationId) => {
      const derived = deriveReviewProfileSignals(byLocation.get(locationId) ?? []);
      return derived ? { ...derived, location_id: locationId } : null;
    })
    .filter(Boolean) as Record<string, unknown>[];

  let inserted = 0;
  for (let index = 0; index < rows.length; index += UPSERT_BATCH) {
    const batch = rows.slice(index, index + UPSERT_BATCH);
    const { error } = await supabaseAdmin
      .from("location_review_ml_features")
      .upsert(batch, { onConflict: "location_id", ignoreDuplicates: true });
    if (error) throw error;
    inserted += batch.length;
  }

  console.log(JSON.stringify({
    reviewIntelligenceLocations: locationIds.length,
    existingReviewMlLocations: existing.size,
    derivedCandidates: rows.length,
    inserted,
  }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
