import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  activityTagsForOsm,
  applySearchQualityFields,
  uniqueLower,
  type StagedLocationInput,
} from "@/lib/location-growth/shared";
import { calculateStagingQuality } from "@/lib/location-growth/stagingQuality";

export const OVERPASS_USER_AGENT =
  process.env.OVERPASS_USER_AGENT ||
  "TheOutHaven/1.0 location-importer support@theouthaven.com";

export const OVERPASS_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];
export const NYC_BBOX = {
  south: 40.477399,
  west: -74.25909,
  north: 40.917577,
  east: -73.700272,
};

export const NYC_METRO_BBOX = {
  south: 40.35,
  west: -74.35,
  north: 41.05,
  east: -73.55,
};

type OsmCategoryGroup =
  | "all"
  | "nightlife"
  | "culture"
  | "activities"
  | "dessert";

export type OsmFilter = {
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
    {
      label: "Community centres",
      tagKey: "amenity",
      tagValue: "community_centre",
    },
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

export function buildSingleFilterQuery({
  bbox = NYC_BBOX,
  filter,
}: {
  bbox?: typeof NYC_BBOX;
  filter: OsmFilter;
}) {
  const box = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;

  return `[out:json][timeout:20];
(
  node["${filter.tagKey}"="${filter.tagValue}"](${box});
  way["${filter.tagKey}"="${filter.tagValue}"](${box});
  relation["${filter.tagKey}"="${filter.tagValue}"](${box});
);
out tags center;`;
}

export function buildNodeOnlyFilterQuery({
  bbox = NYC_METRO_BBOX,
  filter,
}: {
  bbox?: typeof NYC_METRO_BBOX;
  filter: OsmFilter;
}) {
  const box = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;

  return `[out:json][timeout:20];
node["${filter.tagKey}"="${filter.tagValue}"](${box});
out tags;`;
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

export type OverpassQueryMode =
  | "nwr_nyc"
  | "nwr_nyc_metro"
  | "node_only_nyc_metro";

type OverpassResult = {
  elements: OsmElement[];
  overpassEndpoint: string | null;
  attemptedEndpoints: OverpassAttempt[];
  bboxUsed: "nyc" | "nyc_metro";
  queryMode: OverpassQueryMode;
  query: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function fetchOverpassForQuery({
  filter,
  query,
  bboxUsed,
  queryMode,
}: {
  filter: OsmFilter;
  query: string;
  bboxUsed: "nyc" | "nyc_metro";
  queryMode: OverpassQueryMode;
}): Promise<OverpassResult> {
  const attemptedEndpoints: OverpassAttempt[] = [];

  for (const endpoint of OVERPASS_ENDPOINTS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          Accept: "application/json",
          "User-Agent": OVERPASS_USER_AGENT,
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
            status: response.status,
            error: "Invalid Overpass JSON: elements array missing",
          });
          continue;
        }

        attemptedEndpoints.push({
          endpoint,
          ok: true,
          status: response.status,
        });
        return {
          elements: payload.elements as OsmElement[],
          overpassEndpoint: endpoint,
          attemptedEndpoints,
          bboxUsed,
          queryMode,
          query,
        };
      } catch (error) {
        attemptedEndpoints.push({
          endpoint,
          ok: false,
          status: response.status,
          error: `Invalid Overpass JSON: ${errorMessage(error)}`,
        });
      }
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "AbortError";
      attemptedEndpoints.push({
        endpoint,
        ok: false,
        error: timedOut
          ? "OSM Overpass request timed out after 20 seconds"
          : errorMessage(error),
      });

      if (timedOut) {
        throw new Error(
          "OSM Overpass request timed out after 20 seconds. Try limit 10 or another category group.",
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(
    `All Overpass endpoints rejected or timed out for ${filter.label} (${filter.tagKey}=${filter.tagValue}) using ${bboxUsed}. Attempts: ${attemptedEndpoints
      .map(
        (attempt) =>
          `${attempt.endpoint}: ${attempt.status ? `${attempt.status} ` : ""}${
            attempt.error || "failed"
          }`,
      )
      .join(" | ")}`,
  );
}

async function fetchOverpassElements(
  filter: OsmFilter,
): Promise<OverpassResult> {
  const nycResult = await fetchOverpassForQuery({
    filter,
    query: buildSingleFilterQuery({ filter, bbox: NYC_BBOX }),
    bboxUsed: "nyc",
    queryMode: "nwr_nyc",
  });
  if (nycResult.elements.length > 0) return nycResult;

  const metroResult = await fetchOverpassForQuery({
    filter,
    query: buildSingleFilterQuery({ filter, bbox: NYC_METRO_BBOX }),
    bboxUsed: "nyc_metro",
    queryMode: "nwr_nyc_metro",
  });
  if (metroResult.elements.length > 0) {
    return {
      ...metroResult,
      attemptedEndpoints: [
        ...nycResult.attemptedEndpoints,
        ...metroResult.attemptedEndpoints,
      ],
    };
  }

  const nodeOnlyResult = await fetchOverpassForQuery({
    filter,
    query: buildNodeOnlyFilterQuery({ filter, bbox: NYC_METRO_BBOX }),
    bboxUsed: "nyc_metro",
    queryMode: "node_only_nyc_metro",
  });

  return {
    ...nodeOnlyResult,
    attemptedEndpoints: [
      ...nycResult.attemptedEndpoints,
      ...metroResult.attemptedEndpoints,
      ...nodeOnlyResult.attemptedEndpoints,
    ],
  };
}

async function createOsmBatch(metadata: Record<string, unknown>) {
  const { data: batch, error } = await supabaseAdmin
    .from("location_import_batches")
    .insert({
      source: "osm",
      source_label: "OpenStreetMap Activities",
      status: "running",
      metadata,
    })
    .select("id")
    .single();

  if (error) throw error;
  return batch.id as string;
}

export async function importOsmActivities({
  limit = 25,
  offset = 0,
  categoryGroup = "nightlife",
  filterIndex = 0,
}: {
  limit?: number;
  offset?: number;
  categoryGroup?: string;
  filterIndex?: number;
}) {
  const numericLimit = Number(limit || 25);
  const numericOffset = Number(offset || 0);
  const numericFilterIndex = Number(filterIndex || 0);
  const cappedLimit = Number.isFinite(numericLimit)
    ? Math.min(Math.max(Math.trunc(numericLimit), 1), 100)
    : 25;
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
    ? Math.max(Math.trunc(numericFilterIndex), 0)
    : 0;
  const skippedFilters: Array<{
    filterIndex: number;
    filterLabel: string;
    filterTag: string;
    reason: string;
  }> = [];
  let batchId: string | null = null;

  try {
    if (startFilterIndex >= filters.length) {
      return {
        success: true,
        batchId: null,
        seen: 0,
        mapped: 0,
        staged: 0,
        duplicatesRemoved: 0,
        limit: cappedLimit,
        categoryGroup: safeCategoryGroup,
        filterIndex: null,
        exhausted: true,
        offset: safeOffset,
        nextCursor: null,
        hasMore: false,
        skippedFilters,
        bboxUsed: "nyc" as const,
        message:
          "OSM cursor is complete for this category. Reset cursor to import from the beginning again.",
      };
    }

    let lastError: Error | null = null;
    let hadEndpointFailure = false;
    let hadSuccessfulOverpassResponse = false;
    let lastAttemptedEndpoints: OverpassAttempt[] = [];
    let lastBboxUsed: "nyc" | "nyc_metro" = "nyc";
    let lastQueryMode: OverpassQueryMode | null = null;

    for (
      let currentFilterIndex = startFilterIndex;
      currentFilterIndex < Math.min(filters.length, startFilterIndex + 1);
      currentFilterIndex += 1
    ) {
      const filter = filters[currentFilterIndex];
      const filterTag = `${filter.tagKey}=${filter.tagValue}`;
      const effectiveOffset =
        currentFilterIndex === startFilterIndex ? safeOffset : 0;

      try {
        const overpass = await fetchOverpassElements(filter);
        hadSuccessfulOverpassResponse = true;
        lastAttemptedEndpoints = overpass.attemptedEndpoints;
        lastBboxUsed = overpass.bboxUsed;
        lastQueryMode = overpass.queryMode;

        const sortedElements = [...overpass.elements].sort((a, b) => {
          const aKey = `${a.type}:${a.id}`;
          const bKey = `${b.type}:${b.id}`;
          return aKey.localeCompare(bKey);
        });

        if (!sortedElements.length) {
          skippedFilters.push({
            filterIndex: currentFilterIndex,
            filterLabel: filter.label,
            filterTag,
            reason: "No elements returned",
          });
          continue;
        }

        if (effectiveOffset >= sortedElements.length) {
          skippedFilters.push({
            filterIndex: currentFilterIndex,
            filterLabel: filter.label,
            filterTag,
            reason: "Cursor offset exceeded available results",
          });
          continue;
        }

        const selectedElements = sortedElements.slice(
          effectiveOffset,
          effectiveOffset + cappedLimit,
        );
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

        const mappedWithoutBatch = selectedElements
          .map(mapElement)
          .filter((item): item is StagedLocationInput => Boolean(item));

        const stagedWithoutBatch = dedupeStagedLocationsForUpsert(
          mappedWithoutBatch.map(applySearchQualityFields),
        );

        if (!stagedWithoutBatch.length) {
          skippedFilters.push({
            filterIndex: currentFilterIndex,
            filterLabel: filter.label,
            filterTag,
            reason: "Filter returned no stageable named records",
          });
          continue;
        }

        if (!batchId) {
          batchId = await createOsmBatch({
            limit: cappedLimit,
            offset: effectiveOffset,
            filterIndex: currentFilterIndex,
            categoryGroup: safeCategoryGroup,
            filterLabel: filter.label,
            filterTag,
            bbox: overpass.bboxUsed,
            bboxUsed: overpass.bboxUsed,
            queryMode: overpass.queryMode,
            overpassEndpoint: overpass.overpassEndpoint,
          });
        }

        const mapped = mappedWithoutBatch.map((item) => ({
          ...item,
          batch_id: batchId,
        }));
        const staged = stagedWithoutBatch.map((item) => ({
          ...item,
          batch_id: batchId,
        }));

        const stagedForUpsert = staged.map((item) => ({
          ...item,
          ...calculateStagingQuality(item),
          import_status: "staged",
          duplicate_status: "unchecked",
          duplicate_score: 0,
          matched_location_id: null,
          rejection_reason: null,
          updated_at: new Date().toISOString(),
        }));

        const publishReadyCount = stagedForUpsert.filter(
          (item) => item.quality_status === "publish_ready",
        ).length;
        const rejectedCount = stagedForUpsert.filter(
          (item) => item.quality_status === "reject",
        ).length;

        const { error } = await supabaseAdmin
          .from("location_import_staging")
          .upsert(stagedForUpsert, { onConflict: "source,source_id" });
        if (error) {
          throw new Error(`Failed to stage OSM activities: ${error.message}`);
        }

        const { error: updateError } = await supabaseAdmin
          .from("location_import_batches")
          .update({
            status: "staged",
            total_seen: overpass.elements.length,
            total_staged: staged.length,
            total_duplicates: mapped.length - staged.length,
            total_rejected: rejectedCount,
            total_publish_ready: publishReadyCount,
            metadata: {
              limit: cappedLimit,
              offset: effectiveOffset,
              categoryGroup: safeCategoryGroup,
              filterIndex: currentFilterIndex,
              filterLabel: filter.label,
              filterTag,
              overpassEndpoint: overpass.overpassEndpoint,
              attemptedEndpoints: overpass.attemptedEndpoints,
              nextCursor,
              hasMore,
              mapped: mapped.length,
              duplicatesRemoved: mapped.length - staged.length,
              skippedFilters,
              bbox: overpass.bboxUsed,
              bboxUsed: overpass.bboxUsed,
              queryMode: overpass.queryMode,
              query: overpass.query,
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
          offset: effectiveOffset,
          nextCursor,
          hasMore,
          overpassEndpoint: overpass.overpassEndpoint,
          attemptedEndpoints: overpass.attemptedEndpoints,
          skippedFilters,
          bboxUsed: overpass.bboxUsed,
          queryMode: overpass.queryMode,
          message: "OSM records staged. Run Dedupe Chunk next.",
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (
          !lastError.message.includes(
            "All Overpass endpoints rejected or timed out",
          )
        ) {
          throw lastError;
        }

        hadEndpointFailure = true;
        skippedFilters.push({
          filterIndex: currentFilterIndex,
          filterLabel: filter.label,
          filterTag,
          reason: lastError.message,
        });

        if (batchId) {
          await supabaseAdmin
            .from("location_import_batches")
            .update({
              metadata: {
                limit: cappedLimit,
                offset: effectiveOffset,
                categoryGroup: safeCategoryGroup,
                filterIndex: currentFilterIndex,
                filterLabel: filter.label,
                filterTag,
                skippedFilters,
                bbox: lastBboxUsed,
                bboxUsed: lastBboxUsed,
                queryMode: lastQueryMode,
              },
            })
            .eq("id", batchId);
        }
      }
    }

    if (hadEndpointFailure && !hadSuccessfulOverpassResponse) {
      const failure = new Error(
        `All Overpass endpoints rejected or timed out for ${safeCategoryGroup}. Filters tried: ${
          skippedFilters
            .map(
              (filter) =>
                `${filter.filterLabel} (${filter.filterTag}): ${filter.reason}`,
            )
            .join(" | ") ||
          lastError?.message ||
          "none"
        }`,
      );
      await markBatchFailed(batchId, failure);
      throw failure;
    }

    const result = {
      success: true,
      batchId: null,
      seen: 0,
      mapped: 0,
      staged: 0,
      duplicatesRemoved: 0,
      limit: cappedLimit,
      categoryGroup: safeCategoryGroup,
      filterIndex: null,
      exhausted: true,
      offset: 0,
      nextCursor: null,
      hasMore: false,
      overpassEndpoint: lastAttemptedEndpoints.find((attempt) => attempt.ok)
        ?.endpoint,
      attemptedEndpoints: lastAttemptedEndpoints,
      skippedFilters,
      bboxUsed: lastBboxUsed,
      queryMode: lastQueryMode,
      message:
        "No OSM records found for this cursor. Try resetting cursor or another category group.",
    };

    return result;
  } catch (error) {
    await markBatchFailed(batchId, error);
    throw error;
  }
}
