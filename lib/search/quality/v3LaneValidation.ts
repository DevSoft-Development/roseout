import type { RetrievalLaneResult } from "@/lib/search-framework";

export const SEARCH_V3_CORE_LANES = [
  "structured",
  "bm25",
  "semantic_dense",
  "semantic_food",
  "semantic_menu",
] as const;

export type SearchV3CoreLane = typeof SEARCH_V3_CORE_LANES[number];

export function validateSearchV3CoreLanes(
  retrieval: readonly RetrievalLaneResult[],
) {
  const observed = new Set(retrieval.map((lane) => lane.lane));
  const missing = SEARCH_V3_CORE_LANES.filter((lane) => !observed.has(lane));
  const diagnostics = Object.fromEntries(
    SEARCH_V3_CORE_LANES.map((lane) => {
      const result = retrieval.find((item) => item.lane === lane);
      return [lane, {
        present: Boolean(result),
        candidateCount: result?.candidates.length ?? 0,
        elapsedMs: result?.elapsedMs ?? null,
        truncated: result?.truncated ?? false,
      }];
    }),
  );

  return {
    passed: missing.length === 0,
    required: [...SEARCH_V3_CORE_LANES],
    observed: [...observed].sort(),
    missing,
    diagnostics,
  };
}
