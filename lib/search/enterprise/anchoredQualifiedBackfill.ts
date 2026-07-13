import type { EnterpriseLocation } from "./types";
import { estimateWalkingMinutes, haversineMiles } from "./distance";
import { matchesAnchoredQualifier } from "./anchoredQueryNormalization";
import { filterAnchoredRestaurantResults } from "./anchoredRestaurantEligibility";

const EXPANDED_RADIUS_MILES = 3;
const MIN_QUALIFIED_RESULTS = 3;
const BROADER_RESULT_LIMIT = 6;

function locationName(row: EnterpriseLocation) {
  return String(row.name || row.restaurant_name || row.activity_name || "").trim();
}

function restaurantDomainFilter() {
  return "restaurant_name.not.is.null,cuisine.not.is.null,cuisine_type.not.is.null,location_type.ilike.%restaurant%,primary_category.ilike.%restaurant%,primary_category.ilike.%dining%,primary_category.ilike.%cafe%";
}

function qualityScore(row: EnterpriseLocation) {
  const rating = Math.max(0, Math.min(5, Number(row.rating) || 0)) / 5;
  const reviews = Math.min(
    1,
    Math.log10(Math.max(1, Number(row.review_count) || 1)) / 4,
  );
  const curated = Math.max(
    0,
    Math.min(
      1,
      Number(
        row.recommendation_score ??
          row.search_score ??
          row.quality_score ??
          row.theouthaven_score ??
          row.roseout_score ??
          0,
      ) / 100,
    ),
  );
  return rating * 0.5 + reviews * 0.2 + curated * 0.3;
}

function uniqueRows(rows: EnterpriseLocation[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = String(row.id ?? `${locationName(row)}:${row.address ?? ""}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type QualifiedAnchorBackfillResult = {
  qualifiedRestaurants: EnterpriseLocation[];
  broaderNearbyRestaurants: EnterpriseLocation[];
  expandedRadiusMiles: number;
  expandedCandidateCount: number;
  qualifiedAddedCount: number;
};

export async function backfillQualifiedAnchorRestaurants(args: {
  supabase: any;
  anchor: EnterpriseLocation;
  query: string;
  qualifier: string;
  existingQualified: EnterpriseLocation[];
  displayLimit: number;
}): Promise<QualifiedAnchorBackfillResult> {
  const lat = Number(args.anchor.latitude);
  const lon = Number(args.anchor.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return {
      qualifiedRestaurants: args.existingQualified,
      broaderNearbyRestaurants: [],
      expandedRadiusMiles: EXPANDED_RADIUS_MILES,
      expandedCandidateCount: 0,
      qualifiedAddedCount: 0,
    };
  }

  const latDelta = EXPANDED_RADIUS_MILES / 69;
  const lonDelta =
    EXPANDED_RADIUS_MILES /
    Math.max(20, 69 * Math.cos((lat * Math.PI) / 180));

  const { data, error } = await args.supabase
    .from("locations")
    .select("*")
    .gte("latitude", lat - latDelta)
    .lte("latitude", lat + latDelta)
    .gte("longitude", lon - lonDelta)
    .lte("longitude", lon + lonDelta)
    .eq("is_searchable", true)
    .not("is_hidden", "is", true)
    .is("deleted_at", null)
    .or(restaurantDomainFilter())
    .limit(300);

  const anchorName = locationName(args.anchor);
  const expanded = (
    error || !Array.isArray(data) ? [] : (data as EnterpriseLocation[])
  )
    .filter((row) => String(row.id) !== String(args.anchor.id))
    .map((row) => {
      const distance = haversineMiles(
        lat,
        lon,
        Number(row.latitude),
        Number(row.longitude),
      );
      const proximityScore = Math.max(0, 1 - distance / EXPANDED_RADIUS_MILES);
      const anchoredRankScore = proximityScore * 0.72 + qualityScore(row) * 0.28;
      return {
        ...row,
        distance_miles: Number(distance.toFixed(2)),
        anchor_distance_miles: Number(distance.toFixed(2)),
        anchor_walking_minutes: estimateWalkingMinutes(distance),
        anchor_location_id: args.anchor.id,
        anchor_location_name: anchorName,
        anchored_rank_score: Number(anchoredRankScore.toFixed(4)),
        distance_label: `${distance.toFixed(1)} mi from ${anchorName}`,
      } as EnterpriseLocation;
    })
    .filter(
      (row) => Number(row.anchor_distance_miles) <= EXPANDED_RADIUS_MILES,
    )
    .sort(
      (a, b) =>
        Number(b.anchored_rank_score) - Number(a.anchored_rank_score) ||
        Number(a.anchor_distance_miles) - Number(b.anchor_distance_miles),
    );

  const qualifiedExpanded = filterAnchoredRestaurantResults(
    expanded.filter((row) => matchesAnchoredQualifier(row, args.qualifier)),
    args.query,
    args.displayLimit,
  ).results;

  const qualifiedRestaurants = uniqueRows([
    ...args.existingQualified,
    ...qualifiedExpanded,
  ]).slice(0, args.displayLimit);

  const qualifiedIds = new Set(
    qualifiedRestaurants.map((row) => String(row.id)).filter(Boolean),
  );

  const broaderNearbyRestaurants =
    qualifiedRestaurants.length >= MIN_QUALIFIED_RESULTS
      ? []
      : filterAnchoredRestaurantResults(
          expanded.filter(
            (row) =>
              !matchesAnchoredQualifier(row, args.qualifier) &&
              !qualifiedIds.has(String(row.id)),
          ),
          "restaurant",
          BROADER_RESULT_LIMIT,
        ).results.slice(0, BROADER_RESULT_LIMIT);

  return {
    qualifiedRestaurants,
    broaderNearbyRestaurants,
    expandedRadiusMiles: EXPANDED_RADIUS_MILES,
    expandedCandidateCount: expanded.length,
    qualifiedAddedCount: Math.max(
      0,
      qualifiedRestaurants.length - args.existingQualified.length,
    ),
  };
}
