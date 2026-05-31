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
  | "nightlife"
  | "culture"
  | "activities"
  | "dessert"
  | "all";

type OsmFilter = {
  group: OsmCategoryGroup;
  label: string;
  tagKey: string;
  tagValue: string;
};

type OsmCursor = {
  categoryGroup?: string;
  filterIndex?: number;
  offset?: number;
};

const OSM_FILTERS: OsmFilter[] = [
  { group: "nightlife", label: "Bars", tagKey: "amenity", tagValue: "bar" },
  { group: "nightlife", label: "Pubs", tagKey: "amenity", tagValue: "pub" },
  {
    group: "nightlife",
    label: "Nightclubs",
    tagKey: "amenity",
    tagValue: "nightclub",
  },
  {
    group: "nightlife",
    label: "Biergartens",
    tagKey: "amenity",
    tagValue: "biergarten",
  },
  { group: "culture", label: "Museums", tagKey: "tourism", tagValue: "museum" },
  { group: "culture", label: "Galleries", tagKey: "tourism", tagValue: "gallery" },
  {
    group: "culture",
    label: "Attractions",
    tagKey: "tourism",
    tagValue: "attraction",
  },
  { group: "culture", label: "Theaters", tagKey: "amenity", tagValue: "theatre" },
  { group: "culture", label: "Cinemas", tagKey: "amenity", tagValue: "cinema" },
  {
    group: "culture",
    label: "Arts Centres",
    tagKey: "amenity",
    tagValue: "arts_centre",
  },
  {
    group: "activities",
    label: "Bowling Alleys",
    tagKey: "amenity",
    tagValue: "bowling_alley",
  },
  { group: "activities", label: "Bowling", tagKey: "sport", tagValue: "bowling" },
  {
    group: "activities",
    label: "Mini Golf",
    tagKey: "leisure",
    tagValue: "miniature_golf",
  },
  { group: "activities", label: "Parks", tagKey: "leisure", tagValue: "park" },
  {
    group: "activities",
    label: "Karaoke",
    tagKey: "amenity",
    tagValue: "karaoke_box",
  },
  {
    group: "activities",
    label: "Community Centres",
    tagKey: "amenity",
    tagValue: "community_centre",
  },
  { group: "dessert", label: "Ice Cream", tagKey: "shop", tagValue: "ice_cream" },
  { group: "dessert", label: "Pastry Shops", tagKey: "shop", tagValue: "pastry" },
  { group: "dessert", label: "Bakeries", tagKey: "shop", tagValue: "bakery" },
  {
    group: "dessert",
    label: "Chocolate Shops",
    tagKey: "shop",
    tagValue: "chocolate",
  },
  { group: "dessert", label: "Cafes", tagKey: "amenity", tagValue: "cafe" },
];

function getFiltersForGroup(categoryGroup: string): OsmFilter[] {
  if (categoryGroup === "all") return OSM_FILTERS;

  const validGroups = ["nightlife", "culture", "activities", "dessert"];
  const safeGroup = validGroups.includes(categoryGroup)
    ? categoryGroup
    : "nightlife";

  return OSM_FILTERS.filter((filter) => filter.group === safeGroup);
}

function getSafeCategoryGroup(categoryGroup: string) {
  return (["nightlife", "culture", "activities", "dessert", "all"].includes(
    categoryGroup,
  )
    ? categoryGroup
    : "nightlife") as OsmCategoryGroup;
}

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

function buildSingleFilterQuery({
  bbox = NYC_BBOX,
  filter,
  overpassLimit,
}: {
  bbox?: typeof NYC_BBOX;
  filter: OsmFilter;
  overpassLimit: number;
}) {
  const box = `(${bbox.south},${bbox.west},${bbox.north},${bbox.east})`;

  return `
[out:json][timeout:25];
nwr["${filter.tagKey}"="${filter.tagValue}"]${box};
out center ${overpassLimit};
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

async function fetchOverpassElements(query: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(OVERPASS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=UTF-8",
        Accept: "application/json",
        "User-Agent": "TheOutHaven Location Importer",
      },
      body: query,
      cache: "no-store",
      signal: controller.signal,
    });

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(
        `OSM Overpass import failed: HTTP ${response.status} ${response.statusText}${
          responseText ? ` - ${responseText.slice(0, 700)}` : ""
        }`,
      );
    }

    let json: { elements?: unknown };
    try {
      json = JSON.parse(responseText) as { elements?: unknown };
    } catch {
      throw new Error(
        `OSM Overpass returned invalid JSON: ${responseText.slice(0, 500)}`,
      );
    }

    if (!Array.isArray(json.elements)) {
      throw new Error("OSM Overpass response did not include elements array.");
    }

    return json.elements as OsmElement[];
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        "OSM Overpass request timed out. Try a smaller limit or a different category group.",
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeCursor(
  cursor: OsmCursor | null,
  categoryGroup: OsmCategoryGroup,
) {
  return {
    categoryGroup,
    filterIndex: Math.max(Number(cursor?.filterIndex || 0), 0),
    offset: Math.max(Number(cursor?.offset || 0), 0),
  };
}

export async function importOsmActivities({
  limit = 250,
  cursor = null,
  categoryGroup = "nightlife",
}: {
  limit?: number;
  cursor?: OsmCursor | null;
  categoryGroup?: string;
}) {
  const numericLimit = Number(limit || 250);
  const cappedLimit = Number.isFinite(numericLimit)
    ? Math.min(Math.max(Math.trunc(numericLimit), 1), 1000)
    : 250;
  const cursorCategoryGroup =
    typeof cursor?.categoryGroup === "string" && cursor.categoryGroup.trim()
      ? cursor.categoryGroup.trim()
      : categoryGroup;
  const safeCategoryGroup = getSafeCategoryGroup(cursorCategoryGroup);
  const filters = getFiltersForGroup(safeCategoryGroup);
  const normalizedCursor = normalizeCursor(cursor, safeCategoryGroup);
  let filterIndex = Math.min(normalizedCursor.filterIndex, filters.length - 1);
  let offset = normalizedCursor.offset;
  let batchId: string | null = null;
  let selectedFilter = filters[filterIndex];

  try {
    const filterTag = `${selectedFilter.tagKey}=${selectedFilter.tagValue}`;
    const { data: batch, error: batchError } = await supabaseAdmin
      .from("location_import_batches")
      .insert({
        source: "osm",
        source_label: "OpenStreetMap Activities",
        status: "running",
        metadata: {
          limit: cappedLimit,
          categoryGroup: safeCategoryGroup,
          cursor,
          filterIndex,
          filterLabel: selectedFilter.label,
          filterTag,
          offset,
          bbox: "nyc",
        },
      })
      .select("id")
      .single();

    if (batchError) throw batchError;
    batchId = batch.id as string;

    let sortedElements: OsmElement[] = [];
    let selectedElements: OsmElement[] = [];
    let nextCursor: OsmCursor | null = null;

    while (selectedElements.length === 0 && selectedFilter) {
      const overpassLimit = Math.min(
        Math.max(offset + cappedLimit + 50, cappedLimit),
        1000,
      );
      const query = buildSingleFilterQuery({
        bbox: NYC_BBOX,
        filter: selectedFilter,
        overpassLimit,
      });
      const allElements = await fetchOverpassElements(query);
      sortedElements = [...allElements].sort((a, b) => {
        const aKey = `${a.type}:${a.id}`;
        const bKey = `${b.type}:${b.id}`;
        return aKey.localeCompare(bKey);
      });
      selectedElements = sortedElements.slice(offset, offset + cappedLimit);

      if (offset + cappedLimit < sortedElements.length) {
        nextCursor = {
          categoryGroup: safeCategoryGroup,
          filterIndex,
          offset: offset + cappedLimit,
        };
      } else if (filterIndex + 1 < filters.length) {
        nextCursor = {
          categoryGroup: safeCategoryGroup,
          filterIndex: filterIndex + 1,
          offset: 0,
        };
      } else {
        nextCursor = null;
      }

      if (selectedElements.length > 0 || !nextCursor) {
        break;
      }

      filterIndex = Number(nextCursor.filterIndex || 0);
      offset = Number(nextCursor.offset || 0);
      selectedFilter = filters[filterIndex];
    }

    const activeFilterTag = `${selectedFilter.tagKey}=${selectedFilter.tagValue}`;

    if (selectedElements.length === 0 && !nextCursor) {
      const message = "No more OSM records found for this category.";
      const { error: updateError } = await supabaseAdmin
        .from("location_import_batches")
        .update({
          status: "completed_empty",
          total_seen: 0,
          total_staged: 0,
          total_duplicates: 0,
          metadata: {
            limit: cappedLimit,
            categoryGroup: safeCategoryGroup,
            cursor,
            filterIndex,
            filterLabel: selectedFilter.label,
            filterTag: activeFilterTag,
            offset,
            nextCursor: null,
            hasMore: false,
            message,
            bbox: "nyc",
          },
          completed_at: new Date().toISOString(),
        })
        .eq("id", batchId);
      if (updateError) throw updateError;

      return {
        batchId,
        seen: 0,
        mapped: 0,
        staged: 0,
        duplicatesRemoved: 0,
        limit: cappedLimit,
        categoryGroup: safeCategoryGroup,
        filterIndex,
        filterLabel: selectedFilter.label,
        filterTag: activeFilterTag,
        offset,
        nextCursor: null,
        hasMore: false,
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
        total_seen: sortedElements.length,
        total_staged: staged.length,
        total_duplicates: mapped.length - staged.length,
        metadata: {
          limit: cappedLimit,
          categoryGroup: safeCategoryGroup,
          cursor,
          filterIndex,
          filterLabel: selectedFilter.label,
          filterTag: activeFilterTag,
          offset,
          nextCursor,
          hasMore: Boolean(nextCursor),
          mapped: mapped.length,
          duplicatesRemoved: mapped.length - staged.length,
          bbox: "nyc",
        },
        completed_at: new Date().toISOString(),
      })
      .eq("id", batchId);

    if (updateError) throw updateError;

    return {
      batchId,
      seen: sortedElements.length,
      mapped: mapped.length,
      staged: staged.length,
      duplicatesRemoved: mapped.length - staged.length,
      limit: cappedLimit,
      categoryGroup: safeCategoryGroup,
      filterIndex,
      filterLabel: selectedFilter.label,
      filterTag: activeFilterTag,
      offset,
      nextCursor,
      hasMore: Boolean(nextCursor),
    };
  } catch (error) {
    await markBatchFailed(batchId, error);
    throw error;
  }
}
