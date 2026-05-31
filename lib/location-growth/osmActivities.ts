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
  | "dessert";

const OSM_CATEGORY_FILTERS: Record<OsmCategoryGroup, string[]> = {
  nightlife: [
    'node["amenity"="bar"]',
    'way["amenity"="bar"]',
    'relation["amenity"="bar"]',
    'node["amenity"="pub"]',
    'way["amenity"="pub"]',
    'relation["amenity"="pub"]',
    'node["amenity"="biergarten"]',
    'way["amenity"="biergarten"]',
    'node["amenity"="nightclub"]',
    'way["amenity"="nightclub"]',
    'relation["amenity"="nightclub"]',
  ],
  culture: [
    'node["tourism"="museum"]',
    'way["tourism"="museum"]',
    'relation["tourism"="museum"]',
    'node["tourism"="gallery"]',
    'way["tourism"="gallery"]',
    'node["tourism"="attraction"]',
    'way["tourism"="attraction"]',
    'relation["tourism"="attraction"]',
    'node["amenity"="theatre"]',
    'way["amenity"="theatre"]',
    'relation["amenity"="theatre"]',
    'node["amenity"="cinema"]',
    'way["amenity"="cinema"]',
    'node["amenity"="arts_centre"]',
    'way["amenity"="arts_centre"]',
  ],
  activities: [
    'node["amenity"="bowling_alley"]',
    'way["amenity"="bowling_alley"]',
    'node["sport"="bowling"]',
    'way["sport"="bowling"]',
    'node["leisure"="miniature_golf"]',
    'way["leisure"="miniature_golf"]',
    'node["leisure"="park"]',
    'way["leisure"="park"]',
    'relation["leisure"="park"]',
    'node["amenity"="karaoke_box"]',
    'way["amenity"="karaoke_box"]',
    'node["amenity"="community_centre"]',
    'way["amenity"="community_centre"]',
  ],
  dessert: [
    'node["shop"="ice_cream"]',
    'way["shop"="ice_cream"]',
    'node["shop"="pastry"]',
    'way["shop"="pastry"]',
    'node["shop"="bakery"]',
    'way["shop"="bakery"]',
    'node["shop"="chocolate"]',
    'way["shop"="chocolate"]',
    'node["amenity"="cafe"]',
    'way["amenity"="cafe"]',
  ],
  all: [],
};

OSM_CATEGORY_FILTERS.all = [
  ...OSM_CATEGORY_FILTERS.nightlife,
  ...OSM_CATEGORY_FILTERS.culture,
  ...OSM_CATEGORY_FILTERS.activities,
  ...OSM_CATEGORY_FILTERS.dessert,
];

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

function getCategoryFilters(categoryGroup: string) {
  const safeGroup = (
    ["nightlife", "culture", "activities", "dessert", "all"].includes(
      categoryGroup,
    )
      ? categoryGroup
      : "all"
  ) as OsmCategoryGroup;

  return OSM_CATEGORY_FILTERS[safeGroup];
}

function buildQuery({
  bbox = NYC_BBOX,
  categoryGroup = "all",
}: {
  bbox?: typeof NYC_BBOX;
  categoryGroup?: string;
}) {
  const box = `(${bbox.south},${bbox.west},${bbox.north},${bbox.east})`;
  const filters = getCategoryFilters(categoryGroup);

  const filterLines = filters.map((filter) => `${filter}${box};`).join("\n");

  return `
[out:json][timeout:45];
(
${filterLines}
);
out center tags;
`;
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
  const phone = clean(
    tags.phone || tags["contact:phone"] || tags["addr:phone"],
  );
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
  const query = buildQuery({ categoryGroup });

  try {
    const response = await fetch(OVERPASS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        Accept: "application/json",
      },
      body: new URLSearchParams({ data: query }),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error("[OSM Overpass query]", query);
      throw new Error(
        `OSM Overpass import failed: HTTP ${response.status} ${response.statusText}${
          errorText ? ` - ${errorText.slice(0, 500)}` : ""
        }`,
      );
    }

    try {
      const payload = await response.json();
      return Array.isArray(payload.elements)
        ? (payload.elements as OsmElement[])
        : [];
    } catch {
      throw new Error("OSM Overpass returned invalid JSON");
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        categoryGroup === "all"
          ? "OSM Overpass request timed out for the broad All query. Try Nightlife, Culture, Activities, or Dessert separately."
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
  categoryGroup?: string;
}) {
  const numericLimit = Number(limit || 250);
  const numericOffset = Number(offset || 0);
  const cappedLimit = Number.isFinite(numericLimit)
    ? Math.min(Math.max(Math.trunc(numericLimit), 1), 1000)
    : 250;
  const safeOffset = Number.isFinite(numericOffset)
    ? Math.max(Math.trunc(numericOffset), 0)
    : 0;
  const safeCategoryGroup = (
    ["nightlife", "culture", "activities", "dessert", "all"].includes(
      categoryGroup,
    )
      ? categoryGroup
      : "all"
  ) as OsmCategoryGroup;
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
          bbox: "nyc",
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
            bbox: "nyc",
          },
          completed_at: new Date().toISOString(),
        })
        .eq("id", batchId);
      if (updateError) throw updateError;

      return {
        success: true,
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
      if (error)
        throw new Error(`Failed to stage OSM activities: ${error.message}`);
    }

    await supabaseAdmin.rpc("oh_refresh_staging_quality", {
      p_batch_id: batchId,
    });
    await supabaseAdmin.rpc("oh_find_staging_duplicates", {
      p_batch_id: batchId,
    });

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
          bbox: "nyc",
        },
        completed_at: new Date().toISOString(),
      })
      .eq("id", batchId);

    if (updateError) throw updateError;

    return {
      success: true,
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
