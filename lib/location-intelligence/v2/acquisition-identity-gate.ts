import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { LOCATION_INTELLIGENCE_ADAPTERS } from "@/lib/location-intelligence/v2/orchestrator";

/** IDs-only is deliberately not a profile source: Google Places non-ID content is not persisted. */
export function uniquePlaceIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === "string")
    .map((id) => id.trim()).filter((id) => /^[A-Za-z0-9_-]{8,255}$/.test(id)))].slice(0,20);
}

export async function discoverUnseenGooglePlaceIds(query: string) {
  const google = LOCATION_INTELLIGENCE_ADAPTERS.find((adapter) => adapter.descriptor.id === "google");
  if (!google) throw new Error("google_ids_only_adapter_missing");
  const result = await google.execute({
    capability: "identity", purpose: "discovery", input: {query,limit:20},
  });
  const ids = uniquePlaceIds(result.data);
  if (!ids.length) return { discovered: 0, existing: 0, unseenIds: [] as string[] };
  // Match *all* existing locations, including non-searchable and hidden records.
  const { data: live, error: liveError } = await supabaseAdmin
    .from("locations").select("google_place_id").in("google_place_id", ids);
  if (liveError) throw new Error("acquisition_google_id_live_dedupe_failed");
  // Existing staged rows with the same ID must also block a new paid purchase.
  const { data: staged, error: stagingError } = await supabaseAdmin
    .from("location_import_staging").select("source_id").in("source_id", ids);
  if (stagingError) throw new Error("acquisition_google_id_staging_dedupe_failed");
  const existing = new Set([
    ...(live || []).map((row) => String(row.google_place_id || "")),
    ...(staged || []).map((row) => String(row.source_id || "")),
  ]);
  return { discovered: ids.length, existing: existing.size,
    unseenIds: ids.filter((id) => !existing.has(id)) };
}
