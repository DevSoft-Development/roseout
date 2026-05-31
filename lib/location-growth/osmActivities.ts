import { supabaseAdmin } from "@/lib/supabase-admin";
import { activityTagsForOsm, uniqueLower, type StagedLocationInput } from "@/lib/location-growth/shared";

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const DEFAULT_BBOX = { south: 40.4774, west: -74.2591, north: 40.9176, east: -73.7004 };
function clean(value: unknown) { return String(value || "").trim(); }
function objectUrl(type: string, id: number | string) { return `https://www.openstreetmap.org/${type}/${id}`; }

function buildQuery() {
  const b = `${DEFAULT_BBOX.south},${DEFAULT_BBOX.west},${DEFAULT_BBOX.north},${DEFAULT_BBOX.east}`;
  return `[out:json][timeout:180];(nwr["amenity"~"^(bar|pub|biergarten|nightclub|cinema|theatre|arts_centre|community_centre|karaoke_box)$"](${b});nwr["leisure"~"^(bowling_alley|escape_game|miniature_golf|park|dance|fitness_centre|sports_centre)$"](${b});nwr["tourism"~"^(museum|gallery|attraction|aquarium|zoo)$"](${b});nwr["shop"~"^(ice_cream|pastry|bakery|chocolate|coffee)$"](${b}););out center tags ${5000};`;
}

function mapElement(element: any): StagedLocationInput | null {
  const tags = element.tags || {};
  const name = clean(tags.name);
  if (!name) return null;
  const lat = element.lat ?? element.center?.lat ?? null;
  const lon = element.lon ?? element.center?.lon ?? null;
  const mapped = activityTagsForOsm(tags);
  const address = [tags["addr:housenumber"], tags["addr:street"]].map(clean).filter(Boolean).join(" ") || null;
  const city = clean(tags["addr:city"]) || "New York";
  const sourceId = `${element.type}/${element.id}`;
  const phone = clean(tags.phone || tags["contact:phone"] || tags["addr:phone"]);
  const website = clean(tags.website || tags["contact:website"] || tags.url);
  const keywords = uniqueLower([name, mapped.activity_type, mapped.primary_category, tags.amenity, tags.leisure, tags.tourism, tags.shop, city, "date", "activity", "nyc"]);
  return {
    source: "osm",
    source_id: sourceId,
    source_url: objectUrl(element.type, element.id),
    location_type: mapped.activity_type === "bar" ? "bar" : mapped.activity_type === "nightlife" ? "nightlife" : "activity",
    name,
    activity_name: name,
    address,
    city,
    state: clean(tags["addr:state"]) || "NY",
    zip_code: clean(tags["addr:postcode"]) || null,
    phone: phone || null,
    website: website || null,
    latitude: lat == null ? null : Number(lat),
    longitude: lon == null ? null : Number(lon),
    primary_category: mapped.primary_category,
    activity_type: mapped.activity_type,
    primary_tag: mapped.activity_type,
    tags: uniqueLower([mapped.activity_type, mapped.primary_category, tags.amenity, tags.leisure, tags.tourism, tags.shop]),
    search_keywords: keywords,
    description: `${name} is a ${mapped.primary_category.toLowerCase()} option in ${city}.`,
    raw_payload: element,
  };
}

export async function importOsmActivities({ limit = 1000 }: { limit?: number }) {
  const cappedLimit = Math.min(Math.max(Number(limit) || 1000, 1), 5000);
  const { data: batch, error: batchError } = await supabaseAdmin.from("location_import_batches").insert({ source: "osm", source_label: "OpenStreetMap NYC Activities", status: "running", metadata: { limit: cappedLimit, bbox: DEFAULT_BBOX } }).select("id").single();
  if (batchError) throw batchError;
  const response = await fetch(OVERPASS_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ data: buildQuery() }) });
  if (!response.ok) throw new Error(`Overpass request failed: ${response.status}`);
  const payload = await response.json();
  const elements = Array.isArray(payload.elements) ? payload.elements.slice(0, cappedLimit) : [];
  const staged = elements.map(mapElement).filter(Boolean).map((item: any) => ({ ...item, batch_id: batch.id }));
  if (staged.length) {
    const { error } = await supabaseAdmin.from("location_import_staging").upsert(staged, { onConflict: "source,source_id" });
    if (error) throw error;
  }
  await supabaseAdmin.rpc("oh_refresh_staging_quality", { p_batch_id: batch.id });
  await supabaseAdmin.rpc("oh_find_staging_duplicates", { p_batch_id: batch.id });
  const { error: updateError } = await supabaseAdmin.from("location_import_batches").update({ status: "staged", total_seen: elements.length, total_staged: staged.length }).eq("id", batch.id);
  if (updateError) throw updateError;
  return { batchId: batch.id as string, seen: elements.length, staged: staged.length };
}
