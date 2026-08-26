type QueryMetricInput = {
  query: string;
  result: any;
  elapsedMs: number;
};

type Exposure = { id: string; query: string };

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function identity(value: any): string | null {
  const candidate =
    value?.id ??
    value?.location_id ??
    value?.locationId ??
    value?.linked_location_id ??
    value?.linkedLocationId ??
    value?.location?.id ??
    value?.candidate?.location?.id ??
    null;
  if (candidate == null) return null;
  const normalized = String(candidate).trim();
  return normalized || null;
}

function unique(values: Array<string | null>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] * (upper - position) + sorted[upper] * (position - lower);
}

function exposureSummary(exposures: Exposure[]) {
  const counts = new Map<string, number>();
  for (const exposure of exposures) counts.set(exposure.id, (counts.get(exposure.id) ?? 0) + 1);
  const uniqueCount = counts.size;
  const exposureCount = exposures.length;
  const repeatedExposureCount = Math.max(0, exposureCount - uniqueCount);
  return {
    exposureCount,
    uniqueCount,
    repeatedExposureCount,
    repetitionRate: exposureCount ? repeatedExposureCount / exposureCount : 0,
    topRepeatedIds: [...counts.entries()]
      .filter(([, count]) => count > 1)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 10)
      .map(([id, count]) => ({ id, count })),
  };
}

export function collectQaQueryMetrics(input: QueryMetricInput) {
  const restaurants = asArray(input.result?.restaurants);
  const activities = asArray(input.result?.activities);
  const pairs = asArray(input.result?.pairs);
  const sameVenue = asArray(input.result?.matched_locations ?? input.result?.matchedLocations);
  const restaurantIds = unique(restaurants.map(identity));
  const activityIds = unique(activities.map(identity));
  const sameVenueIds = unique(sameVenue.map(identity));
  const pairRestaurantIds = unique(pairs.map((pair) => identity(pair?.restaurant)));
  const pairActivityIds = unique(pairs.map((pair) => identity(pair?.activity)));
  const allVenueIds = unique([
    ...restaurantIds,
    ...activityIds,
    ...sameVenueIds,
    ...pairRestaurantIds,
    ...pairActivityIds,
  ]);
  const timing = Number(
    input.result?.timing?.totalMs ??
      input.result?.timing?.total_ms ??
      input.result?.searchV2?.timing?.totalMs ??
      input.elapsedMs,
  );
  return {
    query: input.query,
    timingMs: Number.isFinite(timing) ? timing : input.elapsedMs,
    restaurantIds,
    activityIds,
    sameVenueIds,
    pairRestaurantIds,
    pairActivityIds,
    allVenueIds,
    uniqueRestaurantCount: restaurantIds.length,
    uniqueActivityCount: activityIds.length,
    uniquePairRestaurantCount: pairRestaurantIds.length,
    uniquePairActivityCount: pairActivityIds.length,
    uniqueVenueCount: allVenueIds.length,
  };
}

export function summarizeQaBatchDiversity(rows: ReturnType<typeof collectQaQueryMetrics>[]) {
  const restaurantExposures: Exposure[] = [];
  const activityExposures: Exposure[] = [];
  const allExposures: Exposure[] = [];
  for (const row of rows) {
    for (const id of unique([...row.restaurantIds, ...row.pairRestaurantIds])) restaurantExposures.push({ id, query: row.query });
    for (const id of unique([...row.activityIds, ...row.pairActivityIds])) activityExposures.push({ id, query: row.query });
    for (const id of row.allVenueIds) allExposures.push({ id, query: row.query });
  }
  const timings = rows.map((row) => row.timingMs).filter(Number.isFinite);
  return {
    queryCount: rows.length,
    restaurants: exposureSummary(restaurantExposures),
    activities: exposureSummary(activityExposures),
    allVenues: exposureSummary(allExposures),
    latency: {
      p50Ms: percentile(timings, 0.5),
      p95Ms: percentile(timings, 0.95),
      maxMs: timings.length ? Math.max(...timings) : null,
      averageMs: timings.length ? timings.reduce((sum, value) => sum + value, 0) / timings.length : null,
      over2sCount: timings.filter((value) => value >= 2000).length,
      over4sCount: timings.filter((value) => value >= 4000).length,
    },
  };
}
