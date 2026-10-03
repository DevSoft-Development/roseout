import type {
  RetrievalCandidate,
  RetrievalLaneResult,
  SearchFusionProvider,
  SearchIntentGraph,
  SearchV3Request,
} from "@/lib/search-framework";

export interface ReciprocalRankFusionOptions {
  k?: number;
  candidateLimit?: number;
  laneWeights?: Readonly<Record<string, number>>;
}

export class ReciprocalRankFusionProvider implements SearchFusionProvider {
  readonly providerId = "search-v3.rrf.v1";

  constructor(private readonly options: ReciprocalRankFusionOptions = {}) {}

  async fuse(args: {
    request: SearchV3Request;
    intent: SearchIntentGraph;
    lanes: readonly RetrievalLaneResult[];
  }): Promise<RetrievalLaneResult> {
    const startedAt = Date.now();
    return {
      lane: "rrf",
      candidates: reciprocalRankFusion(args.lanes, this.options),
      elapsedMs: Date.now() - startedAt,
      truncated: args.lanes.some((lane) => Boolean(lane.truncated)),
    };
  }
}

export function reciprocalRankFusion(
  lanes: readonly RetrievalLaneResult[],
  options: ReciprocalRankFusionOptions = {},
): RetrievalCandidate[] {
  const k = options.k ?? 60;
  const candidateLimit = Math.max(
    1,
    Math.min(options.candidateLimit ?? 500, 1000),
  );
  const scores = new Map<string, {
    score: number;
    lanes: Array<{ lane: string; rank: number; contribution: number }>;
  }>();

  for (const lane of lanes) {
    const weight = options.laneWeights?.[lane.lane] ?? 1;
    if (weight <= 0) continue;

    for (const candidate of lane.candidates) {
      const contribution = weight / (k + candidate.rank);
      const current = scores.get(candidate.locationId) ?? {
        score: 0,
        lanes: [],
      };
      current.score += contribution;
      current.lanes.push({
        lane: lane.lane,
        rank: candidate.rank,
        contribution,
      });
      scores.set(candidate.locationId, current);
    }
  }

  return [...scores.entries()]
    .sort((a, b) =>
      b[1].score - a[1].score ||
      bestRank(a[1].lanes) - bestRank(b[1].lanes) ||
      a[0].localeCompare(b[0])
    )
    .slice(0, candidateLimit)
    .map(([locationId, value], index) => ({
      locationId,
      lane: "rrf",
      rank: index + 1,
      score: value.score,
      evidence: value.lanes
        .sort((a, b) => a.rank - b.rank)
        .map((entry) => entry.lane + ":rank=" + entry.rank),
      metadata: {
        fusion: "rrf",
        k,
        laneContributions: value.lanes,
      },
    }));
}

function bestRank(
  lanes: readonly { rank: number }[],
): number {
  return Math.min(...lanes.map((entry) => entry.rank));
}
