import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  activityTagsForOsm,
  uniqueLower,
  type StagedLocationInput,
} from "@/lib/location-growth/shared";

const OVERPASS_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
];
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

type OsmFilter = {
  label: string;
  tagKey: string;
  tagValue: string;
};

const OSM_CATEGORY_FILTERS: Record<OsmCategoryGroup, OsmFilter[]> = {
  nightlife: [
    { label: "Bars", tagKey: "amenity", tagValue: "bar" },
    { label: "Pubs", tagKey: "amenity", tagValue: "pub" },
    { label: "Biergartens", tagKey: "amenity", tagValue: "biergarten" },
    { label: "Nightclubs", tagKey: "amenity", tagValue: "nightclub" },
  ],
  culture: [
    { label: "Museums", tagKey: "tourism", tagValue: "museum" },
    { label: "Galleries", tagKey: "tourism", tagValue: "gallery" },
    { label: "Attractions", tagKey: "tourism", tagValue: "attraction" },
    { label: "Theaters", tagKey: "amenity", tagValue: "theatre" },
    { label: "Cinemas", tagKey: "amenity", tagValue: "cinema" },
    { label: "Arts centres", tagKey: "amenity", tagValue: "arts_centre" },
  ],
  activities: [
    { label: "Bowling alleys", tagKey: "amenity", tagValue: "bowling_alley" },
    { label: "Bowling sport", tagKey: "sport", tagValue: "bowling" },
    { label: "Mini golf", tagKey: "leisure", tagValue: "miniature_golf" },
    { label: "Parks", tagKey: "leisure", tagValue: "park" },
    { label: "Karaoke", tagKey: "amenity", tagValue: "karaoke_box" },
    { label: "Community centres", tagKey: "amenity", tagValue: "community_centre" },
  ],
  dessert: [
    { label: "Ice cream shops", tagKey: "shop", tagValue: "ice_cream" },
    { label: "Pastry shops", tagKey: "shop", tagValue: "pastry" },
    { label: "Bakeries", tagKey: "shop", tagValue: "bakery" },
    { label: "Chocolate shops", tagKey: "shop", tagValue: "chocolate" },
    { label: "Cafes", tagKey: "amenity", tagValue: "cafe" },
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

function buildSingleFilterQuery({
  bbox = NYC_BBOX,
  filter,
  overpassLimit,
}: {
  bbox?: typeof NYC_BBOX;
  filter: OsmFilter;
  overpassLimit: number;
}) {
  const box = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  const safeLimit = Math.min(Math.max(Number(overpassLimit || 100), 1), 500);

  return `[out:json][timeout:25];
(
  node["${filter.tagKey}"="${filter.tagValue}"](${box});
  way["${filter.tagKey}"="${filter.tagValue}"](${box});
  relation["${filter.tagKey}"="${filter.tagValue}"](${box});
);
out center qt ${safeLimit};`;
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

type OverpassAttempt = {
  endpoint: string;
  ok: boolean;
  status?: number;
  error?: string;
};

type OverpassResult = {
  elements: OsmElement[];
  overpassEndpoint: string;
  attemptedEndpoints: OverpassAttempt[];
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function fetchOverpassElements(
  filter: OsmFilter,
  overpassLimit: number,
): Promise<OverpassResult> {
  const query = buildSingleFilterQuery({ filter, overpassLimit });
  const attemptedEndpoints: OverpassAttempt[] = [];

  for (const endpoint of OVERPASS_ENDPOINTS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35000);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          Accept: "application/json",
        },
        body: new URLSearchParams({ data: query }).toString(),
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        attemptedEndpoints.push({
          endpoint,
          ok: false,
          status: response.status,
          error: `HTTP ${response.status} ${response.statusText}${
            errorText ? ` - ${errorText.slice(0, 500)}` : ""
          }`,
        });
        continue;
      }

      try {
        const payload = await response.json();
        if (!Array.isArray(payload.elements)) {
          attemptedEndpoints.push({
            endpoint,
            ok: false,
            error: "Invalid Overpass JSON: elements array missing",
          });
          continue;
        }

        attemptedEndpoints.push({ endpoint, ok: true, status: response.status });
        return {
          elements: payload.elements as OsmElement[],
          overpassEndpoint: endpoint,
          attemptedEndpoints,
        };
      } catch (error) {
        attemptedEndpoints.push({
          endpoint,
          ok: false,
          error: `Invalid Overpass JSON: ${errorMessage(error)}`,
        });
      }
    } catch (error) {
      attemptedEndpoints.push({
        endpoint,
        ok: false,
        error:
          error instanceof Error && error.name === "AbortError"
            ? "Request timed out"
            : errorMessage(error),
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(
    `All Overpass endpoints rejected or timed out for ${filter.label} (${filter.tagKey}=${filter.tagValue}). Attempts: ${attemptedEndpoints
      .map(
        (attempt) =>
          `${attempt.endpoint}: ${attempt.status ? `${attempt.status} ` : ""}${
            attempt.error || "failed"
          }`,
      )
      .join(" | ")}`,
  );
}

export async function importOsmActivities({
  limit = 50,
  offset = 0,
  categoryGroup = "nightlife",
  filterIndex = 0,
}: {
  limit?: number;
  offset?: number;
  categoryGroup?: string;
  filterIndex?: number;
}) {
  const numericLimit = Number(limit || 50);
  const numericOffset = Number(offset || 0);
  const numericFilterIndex = Number(filterIndex || 0);
  const cappedLimit = Number.isFinite(numericLimit)
    ? Math.min(Math.max(Math.trunc(numericLimit), 1), 250)
    : 50;
  const safeOffset = Number.isFinite(numericOffset)
    ? Math.max(Math.trunc(numericOffset), 0)
    : 0;
  const safeCategoryGroup = (
    ["nightlife", "culture", "activities", "dessert", "all"].includes(
      categoryGroup,
    )
      ? categoryGroup
      : "nightlife"
  ) as OsmCategoryGroup;
  const filters = getCategoryFilters(safeCategoryGroup);
  const startFilterIndex = Number.isFinite(numericFilterIndex)
    ? Math.min(Math.max(Math.trunc(numericFilterIndex), 0), filters.length - 1)
    : 0;
  const initialOverpassLimit = Math.min(safeOffset + cappedLimit + 25, 500);
  const skippedFilters: Array<{
    filterIndex: number;
    filterLabel: string;
    filterTag: string;
    error: string;
  }> = [];
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
          filterIndex: startFilterIndex,
          categoryGroup: safeCategoryGroup,
          overpassLimit: initialOverpassLimit,
          bbox: "nyc",
        },
      })
      .select("id")
      .single();

    if (batchError) throw batchError;
    batchId = batch.id as string;

    let lastError: Error | null = null;

    for (
      let currentFilterIndex = startFilterIndex;
      currentFilterIndex < filters.length;
      currentFilterIndex += 1
    ) {
      const filter = filters[currentFilterIndex];
      const filterTag = `${filter.tagKey}=${filter.tagValue}`;

      try {
        const effectiveOffset =
          currentFilterIndex === startFilterIndex ? safeOffset : 0;
        const overpassLimit = Math.min(effectiveOffset + cappedLimit + 25, 500);
        const overpass = await fetchOverpassElements(filter, overpassLimit);
        const sortedElements = [...overpass.elements].sort((a, b) => {
          const aKey = `${a.type}:${a.id}`;
          const bKey = `${b.type}:${b.id}`;
          return aKey.localeCompare(bKey);
        });
        const selectedElements = sortedElements.slice(
          effectiveOffset,
          effectiveOffset + cappedLimit,
        );

        if (!selectedElements.length) {
          skippedFilters.push({
            filterIndex: currentFilterIndex,
            filterLabel: filter.label,
            filterTag,
            error: sortedElements.length
              ? `Filter exhausted at offset ${effectiveOffset}`
              : "Filter returned no elements",
          });
          continue;
        }

        const hasMoreInFilter =
          effectiveOffset + cappedLimit < sortedElements.length;
        const nextCursor = hasMoreInFilter
          ? {
              filterIndex: currentFilterIndex,
              offset: effectiveOffset + cappedLimit,
            }
          : currentFilterIndex + 1 < filters.length
            ? { filterIndex: currentFilterIndex + 1, offset: 0 }
            : null;
        const hasMore = Boolean(nextCursor);

        const mapped = selectedElements
          .map(mapElement)
          .filter((item): item is StagedLocationInput => Boolean(item))
          .map((item) => ({
            ...item,
            batch_id: batchId,
          }));

        const staged = dedupeStagedLocationsForUpsert(mapped);

        if (!staged.length) {
          skippedFilters.push({
            filterIndex: currentFilterIndex,
            filterLabel: filter.label,
            filterTag,
            error: "Filter returned no stageable named records",
          });
          continue;
        }

        const { error } = await supabaseAdmin
          .from("location_import_staging")
          .upsert(staged, { onConflict: "source,source_id" });
        if (error) {
          throw new Error(`Failed to stage OSM activities: ${error.message}`);
        }

        await supabaseAdmin.rpc("oh_refresh_staging_quality", {
          p_batch_id: batchId,
        });

        const { error: updateError } = await supabaseAdmin
          .from("location_import_batches")
          .update({
            status: "staged",
            total_seen: overpass.elements.length,
            total_staged: staged.length,
            total_duplicates: mapped.length - staged.length,
            metadata: {
              limit: cappedLimit,
              offset: effectiveOffset,
              categoryGroup: safeCategoryGroup,
              filterIndex: currentFilterIndex,
              filterLabel: filter.label,
              filterTag,
              overpassLimit,
              overpassEndpoint: overpass.overpassEndpoint,
              attemptedEndpoints: overpass.attemptedEndpoints,
              nextCursor,
              hasMore,
              mapped: mapped.length,
              duplicatesRemoved: mapped.length - staged.length,
              skippedFilters,
              bbox: "nyc",
            },
            completed_at: new Date().toISOString(),
          })
          .eq("id", batchId);

        if (updateError) throw updateError;

        return {
          success: true,
          batchId,
          seen: overpass.elements.length,
          mapped: mapped.length,
          staged: staged.length,
          duplicatesRemoved: mapped.length - staged.length,
          limit: cappedLimit,
          categoryGroup: safeCategoryGroup,
          filterIndex: currentFilterIndex,
          filterLabel: filter.label,
          filterTag,
          offset: currentFilterIndex === startFilterIndex ? safeOffset : 0,
          nextCursor,
          hasMore,
          overpassEndpoint: overpass.overpassEndpoint,
          attemptedEndpoints: overpass.attemptedEndpoints,
          skippedFilters,
          message: skippedFilters.length
            ? "Some OSM filters were skipped, but this batch imported successfully."
            : undefined,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        skippedFilters.push({
          filterIndex: currentFilterIndex,
          filterLabel: filter.label,
          filterTag,
          error: lastError.message,
        });

        await supabaseAdmin
          .from("location_import_batches")
          .update({
            metadata: {
              limit: cappedLimit,
              offset: currentFilterIndex === startFilterIndex ? safeOffset : 0,
              categoryGroup: safeCategoryGroup,
              filterIndex: currentFilterIndex,
              filterLabel: filter.label,
              filterTag,
              overpassLimit:
                currentFilterIndex === startFilterIndex
                  ? initialOverpassLimit
                  : Math.min(cappedLimit + 25, 500),
              skippedFilters,
              bbox: "nyc",
            },
          })
          .eq("id", batchId);
      }
    }

    const failure = new Error(
      `All Overpass filters failed or were exhausted for ${safeCategoryGroup}. All Overpass endpoints rejected or timed out. Filters tried: ${skippedFilters
        .map((filter) => `${filter.filterLabel} (${filter.filterTag}): ${filter.error}`)
        .join(" | ") || lastError?.message || "none"}`,
    );
    await markBatchFailed(batchId, failure);
    throw failure;
  } catch (error) {
    await markBatchFailed(batchId, error);
    throw error;
  }
}
