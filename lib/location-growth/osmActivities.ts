import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  activityTagsForOsm,
  uniqueLower,
  type StagedLocationInput,
} from "@/lib/location-growth/shared";

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const NYC_BBOX = {
  south: 40.4774,
  west: -74.2591,
  north: 40.9176,
  east: -73.7004,
};

type OsmCategoryGroup =
  | "all"
  | "nightlife"
  | "culture"
  | "activities"
  | "dessert"
  | string;

type OsmElement = {
  id: number | string;
  type: string;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function objectUrl(type: string, id: number | string) {
  return `https://www.openstreetmap.org/${type}/${id}`;
}

function filtersForCategoryGroup(categoryGroup: string) {
  const groups: Record<string, string[]> = {
    nightlife: [
      'nwr["amenity"~"^(bar|pub|biergarten|nightclub)$"]({bbox});',
      'nwr["leisure"="dance"]({bbox});',
    ],
    culture: [
      'nwr["tourism"~"^(museum|gallery|attraction|aquarium|zoo)$"]({bbox});',
      'nwr["amenity"~"^(theatre|cinema|arts_centre)$"]({bbox});',
    ],
    activities: [
      'nwr["leisure"~"^(bowling_alley|escape_game|miniature_golf|park|fitness_centre|sports_centre)$"]({bbox});',
      'nwr["amenity"~"^(karaoke_box|community_centre)$"]({bbox});',
    ],
    dessert: [
      'nwr["shop"~"^(ice_cream|pastry|bakery|chocolate|coffee)$"]({bbox});',
      'nwr["amenity"="cafe"]({bbox});',
    ],
  };

  if (categoryGroup === "all") {
    return [
      ...groups.nightlife,
      ...groups.culture,
      ...groups.activities,
      ...groups.dessert,
    ];
  }

  return groups[categoryGroup] || groups.all || [
    ...groups.nightlife,
    ...groups.culture,
    ...groups.activities,
    ...groups.dessert,
  ];
}

function buildQuery({
  bbox = NYC_BBOX,
  categoryGroup = "all",
}: {
  bbox?: typeof NYC_BBOX;
  categoryGroup?: string;
}) {
  const bboxValue = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  const filters = filtersForCategoryGroup(categoryGroup)
    .map((filter) => filter.replace("{bbox}", bboxValue))
    .join("");

  return `[out:json][timeout:180];(${filters});out center tags;`;
}

function mapElement(element: OsmElement): StagedLocationInput | null {
  const tags = element.tags || {};
  const name = clean(tags.name);
  if (!name) return null;

  const lat = element.lat ?? element.center?.lat ?? null;
  const lon = element.lon ?? element.center?.lon ?? null;
  const mapped = activityTagsForOsm(tags);
  const address =
    [tags["addr:housenumber"], tags["addr:street"]]
      .map(clean)
      .filter(Boolean)
      .join(" ") || null;
  const city = clean(tags["addr:city"]) || "New York";
  const sourceId = `${element.type}/${element.id}`;
  const phone = clean(tags.phone || tags["contact:phone"] || tags["addr:phone"]);
  const website = clean(tags.website || tags["contact:website"] || tags.url);
  const keywords = uniqueLower([
    name,
    mapped.activity_type,
    mapped.primary_category,
    tags.amenity,
    tags.leisure,
    tags.tourism,
    tags.shop,
    city,
    "date",
    "activity",
    "nyc",
  ]);

  return {
    source: "osm",
    source_id: sourceId,
    source_url: objectUrl(element.type, element.id),
    location_type:
      mapped.activity_type === "bar"
        ? "bar"
        : mapped.activity_type === "nightlife"
          ? "nightlife"
          : "activity",
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
    tags: uniqueLower([
      mapped.activity_type,
      mapped.primary_category,
      tags.amenity,
      tags.leisure,
      tags.tourism,
      tags.shop,
    ]),
    search_keywords: keywords,
    description: `${name} is a ${mapped.primary_category.toLowerCase()} option in ${city}.`,
    raw_payload: element,
  };
}

function dedupeStagedLocationsForUpsert<
  T extends { source: string; source_id: string },
>(items: T[]) {
  const byKey = new Map<string, T>();

  for (const item of items) {
    const key = `${item.source}::${item.source_id}`;
    if (!byKey.has(key)) {
      byKey.set(key, item);
    }
  }

  return Array.from(byKey.values());
}

async function markBatchFailed(batchId: string | null, error: unknown) {
  if (!batchId) return;

  const message = error instanceof Error ? error.message : String(error);
  await supabaseAdmin
    .from("location_import_batches")
    .update({
      status: "failed",
      error_message: message,
      completed_at: new Date().toISOString(),
    })
    .eq("id", batchId);
}

async function fetchOverpassElements(categoryGroup: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 65000);

  try {
    const response = await fetch(OVERPASS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        Accept: "application/json",
      },
      body: new URLSearchParams({ data: buildQuery({ categoryGroup }) }),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `OSM Overpass import failed: HTTP ${response.status} ${response.statusText}`,
      );
    }

    try {
      const payload = await response.json();
      return Array.isArray(payload.elements) ? (payload.elements as OsmElement[]) : [];
    } catch {
      throw new Error("OSM Overpass returned invalid JSON");
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        categoryGroup === "all"
          ? "OSM Overpass request timed out. Try limit 100 or a smaller category group."
          : "OSM Overpass request timed out. Try a smaller limit or retry later.",
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function importOsmActivities({
  limit = 250,
  offset = 0,
  categoryGroup = "all",
}: {
  limit?: number;
  offset?: number;
  categoryGroup?: OsmCategoryGroup;
}) {
  const numericLimit = Number(limit || 250);
  const numericOffset = Number(offset || 0);
  const cappedLimit = Number.isFinite(numericLimit)
    ? Math.min(Math.max(Math.trunc(numericLimit), 1), 1000)
    : 250;
  const safeOffset = Number.isFinite(numericOffset)
    ? Math.max(Math.trunc(numericOffset), 0)
    : 0;
  const safeCategoryGroup = categoryGroup || "all";
  const nextOffset = safeOffset + cappedLimit;
  let batchId: string | null = null;

  try {
    const { data: batch, error: batchError } = await supabaseAdmin
      .from("location_import_batches")
      .insert({
        source: "osm",
        source_label: "OpenStreetMap Activities",
        status: "running",
        metadata: {
          limit: cappedLimit,
          offset: safeOffset,
          nextOffset,
          categoryGroup: safeCategoryGroup,
          bbox: NYC_BBOX,
        },
      })
      .select("id")
      .single();

    if (batchError) throw batchError;
    batchId = batch.id as string;

    const allElements = await fetchOverpassElements(safeCategoryGroup);
    const sortedElements = [...allElements].sort((a, b) => {
      const aKey = `${a.type}:${a.id}`;
      const bKey = `${b.type}:${b.id}`;
      return aKey.localeCompare(bKey);
    });
    const selectedElements = sortedElements.slice(safeOffset, nextOffset);

    if (
      selectedElements.length === 0 &&
      allElements.length > 0 &&
      safeOffset >= allElements.length
    ) {
      const message =
        "No more OSM records found for this category and region. Reset offset or choose another category group.";
      const { error: updateError } = await supabaseAdmin
        .from("location_import_batches")
        .update({
          status: "completed_empty",
          total_seen: allElements.length,
          total_staged: 0,
          total_duplicates: 0,
          metadata: {
            limit: cappedLimit,
            offset: safeOffset,
            nextOffset,
            categoryGroup: safeCategoryGroup,
            message,
            bbox: NYC_BBOX,
          },
          completed_at: new Date().toISOString(),
        })
        .eq("id", batchId);
      if (updateError) throw updateError;

      return {
        batchId,
        seen: allElements.length,
        mapped: 0,
        staged: 0,
        duplicatesRemoved: 0,
        limit: cappedLimit,
        offset: safeOffset,
        nextOffset,
        categoryGroup: safeCategoryGroup,
        message,
      };
    }

    const mapped = selectedElements
      .map(mapElement)
      .filter((item): item is StagedLocationInput => Boolean(item))
      .map((item) => ({
        ...item,
        batch_id: batchId,
      }));

    const staged = dedupeStagedLocationsForUpsert(mapped);

    if (staged.length) {
      const { error } = await supabaseAdmin
        .from("location_import_staging")
        .upsert(staged, { onConflict: "source,source_id" });
      if (error) throw new Error(`Failed to stage OSM activities: ${error.message}`);
    }

    await supabaseAdmin.rpc("oh_refresh_staging_quality", { p_batch_id: batchId });
    await supabaseAdmin.rpc("oh_find_staging_duplicates", { p_batch_id: batchId });

    const { error: updateError } = await supabaseAdmin
      .from("location_import_batches")
      .update({
        status: "staged",
        total_seen: allElements.length,
        total_staged: staged.length,
        total_duplicates: mapped.length - staged.length,
        metadata: {
          limit: cappedLimit,
          offset: safeOffset,
          nextOffset,
          categoryGroup: safeCategoryGroup,
          mapped: mapped.length,
          duplicatesRemoved: mapped.length - staged.length,
          bbox: NYC_BBOX,
        },
        completed_at: new Date().toISOString(),
      })
      .eq("id", batchId);

    if (updateError) throw updateError;

    return {
      batchId,
      seen: allElements.length,
      mapped: mapped.length,
      staged: staged.length,
      duplicatesRemoved: mapped.length - staged.length,
      limit: cappedLimit,
      offset: safeOffset,
      nextOffset,
      categoryGroup: safeCategoryGroup,
    };
  } catch (error) {
    await markBatchFailed(batchId, error);
    throw error;
  }
}
