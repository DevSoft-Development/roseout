import "server-only";

export type CoverageInventory = {
  area: string;
  category: string;
  current: number;
  target: number;
  searchDemand?: number;
  resultGapRate?: number;
};

export function coveragePriority(input: CoverageInventory) {
  const target = Math.max(1, input.target);
  const deficit = Math.max(0, target - input.current) / target;
  const saturation = Math.max(0, input.current - target) / target;
  const demand = Math.max(0, Number(input.searchDemand || 0));
  const gap = Math.max(0, Number(input.resultGapRate || 0));

  return Math.max(0, deficit * 70 + Math.min(20, demand * 20) + Math.min(20, gap * 20) - saturation * 40);
}

export function sortCoverageGaps(rows: CoverageInventory[]) {
  return [...rows].sort((a, b) => coveragePriority(b) - coveragePriority(a));
}

/** Provider-neutral target. Coordinates must be validated before any geo-scoped paid listing search. */
export type CoverageDiscoveryTarget = {
  market: string;
  area: string;
  category: string;
  score: number;
  query: string;
  locationCoordinate?: string;
};

export function providerDiscoveryInputs(target: CoverageDiscoveryTarget) {
  const query = target.query.trim();
  if (!query || !target.area.trim() || !target.category.trim()) {
    throw new Error("coverage_target_incomplete");
  }
  const result: {
    google: { query: string; limit: number };
    brave: { query: string; count: number };
    dataforseo: { title: string; locationCoordinate: string; limit: number } | null;
  } = {
    google: { query, limit: 10 },
    brave: { query: `${target.category} ${target.area} official website`, count: 10 },
    dataforseo: null,
  };
  if (target.locationCoordinate) {
    const parts = target.locationCoordinate.split(",").map(Number);
    if (parts.length !== 3 || parts.some((x) => !Number.isFinite(x)) ||
      Math.abs(parts[0]) > 90 || Math.abs(parts[1]) > 180 || parts[2] <= 0 || parts[2] > 50) {
      throw new Error("coverage_target_invalid_coordinates");
    }
    result.dataforseo = { title: target.category, locationCoordinate: target.locationCoordinate, limit: 100 };
  }
  return result;
}
