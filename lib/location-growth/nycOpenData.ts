import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeCuisine, uniqueLower, type StagedLocationInput } from "@/lib/location-growth/shared";

const NYC_ENDPOINT = "https://data.cityofnewyork.us/resource/43nn-pn8j.json";
const BORO_CITY: Record<string, string> = { MANHATTAN: "Manhattan", BROOKLYN: "Brooklyn", QUEENS: "Queens", BRONX: "Bronx", "STATEN ISLAND": "Staten Island" };

function toNumber(value: unknown) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function clean(value: unknown) { return String(value || "").trim(); }

function mapNycRow(row: any): StagedLocationInput | null {
  const name = clean(row.dba);
  const sourceId = clean(row.camis);
  if (!name || !sourceId) return null;
  const cuisine = normalizeCuisine(row.cuisine_description);
  const city = BORO_CITY[clean(row.boro).toUpperCase()] || clean(row.boro) || "New York";
  const address = [row.building, row.street].map(clean).filter(Boolean).join(" ") || null;
  const keywords = uniqueLower([name, cuisine, row.cuisine_description, city, "restaurant", "dinner", "date night", "nyc"]);
  return {
    source: "nyc_open_data",
    source_id: sourceId,
    source_url: `${NYC_ENDPOINT}?camis=${encodeURIComponent(sourceId)}`,
    location_type: "restaurant",
    name,
    restaurant_name: name,
    address,
    city,
    state: "NY",
    zip_code: clean(row.zipcode) || null,
    phone: clean(row.phone) || null,
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
    primary_category: cuisine,
    cuisine,
    cuisine_type: cuisine,
    primary_tag: cuisine,
    tags: uniqueLower(["restaurant", cuisine, row.cuisine_description]),
    search_keywords: keywords,
    description: `${name} is a ${String(cuisine).replace(/_/g, " ")} restaurant in ${city}.`,
    raw_payload: row,
  };
}

export async function importNycRestaurants({ limit = 1000, offset = 0 }: { limit?: number; offset?: number }) {
  const cappedLimit = Math.min(Math.max(Number(limit) || 1000, 1), 5000);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const { data: batch, error: batchError } = await supabaseAdmin.from("location_import_batches").insert({ source: "nyc_open_data", source_label: "NYC Open Data Restaurants", status: "running", metadata: { limit: cappedLimit, offset: safeOffset } }).select("id").single();
  if (batchError) throw batchError;
  const url = new URL(NYC_ENDPOINT);
  url.searchParams.set("$limit", String(cappedLimit));
  url.searchParams.set("$offset", String(safeOffset));
  url.searchParams.set("$order", "camis");
  const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`NYC Open Data request failed: ${response.status}`);
  const rows = await response.json();
  const staged = (Array.isArray(rows) ? rows : []).map(mapNycRow).filter(Boolean).map((item: any) => ({ ...item, batch_id: batch.id }));
  if (staged.length) {
    const { error } = await supabaseAdmin.from("location_import_staging").upsert(staged, { onConflict: "source,source_id" });
    if (error) throw error;
  }
  await supabaseAdmin.rpc("oh_refresh_staging_quality", { p_batch_id: batch.id });
  await supabaseAdmin.rpc("oh_find_staging_duplicates", { p_batch_id: batch.id });
  const { error: updateError } = await supabaseAdmin.from("location_import_batches").update({ status: "staged", total_seen: rows.length || 0, total_staged: staged.length }).eq("id", batch.id);
  if (updateError) throw updateError;
  return { batchId: batch.id as string, seen: rows.length || 0, staged: staged.length };
}
