import type {
  RetrievalCandidate,
  RetrievalLaneResult,
  SearchIntentGraph,
  SearchQueryEmbeddingProvider,
  SearchRetrievalProvider,
  SearchV3Request,
} from "@/lib/search-framework";

export interface SemanticRpcClient {
  rpc(functionName: string, args?: Record<string, unknown>): Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
}

export interface SemanticRetrievalOptions {
  candidateLimit?: number;
  minSimilarity?: number;
  expectedEmbeddingModel?: string;
  embeddingVersion?: string;
}

type SearchMatchRow = {
  location_id: string;
  similarity: number | string | null;
};

export class SupabaseSemanticRetrievalProvider implements SearchRetrievalProvider {
  readonly providerId = "theouthaven.supabase-semantic-dense.v1";

  constructor(
    private readonly client: SemanticRpcClient,
    private readonly embeddings: SearchQueryEmbeddingProvider,
    private readonly options: SemanticRetrievalOptions = {},
  ) {}

  async retrieve(args: {
    request: SearchV3Request;
    intent: SearchIntentGraph;
  }): Promise<RetrievalLaneResult> {
    const startedAt = Date.now();
    const expectedDomains = semanticDomains(args.intent);

    if (expectedDomains.length === 0) {
      return {
        lane: "semantic_dense",
        candidates: [],
        elapsedMs: Date.now() - startedAt,
      };
    }

    const embedding = await this.embeddings.embed(
      buildSemanticQueryText(args.intent),
    );

    const expectedModel =
      this.options.expectedEmbeddingModel ?? "text-embedding-3-small";
    if (embedding.model !== expectedModel) {
      throw new Error(
        `Semantic vector-space mismatch: query model ${embedding.model} does not match index model ${expectedModel}.`,
      );
    }

    const embeddingVersion =
      this.options.embeddingVersion ??
      process.env.SEARCH_LOCATION_INTELLIGENCE_EMBEDDING_VERSION ??
      "search-embedding:v1";
    const limit = clamp(this.options.candidateLimit ?? 200, 20, 250);
    const minSimilarity = this.options.minSimilarity ?? 0.55;

    const results = await Promise.all(
      expectedDomains.map(async (expectedDomain) => {
        const { data, error } = await this.client.rpc(
          "match_location_search_embeddings",
          {
            p_query_embedding: [...embedding.vector],
            p_expected_domain: expectedDomain,
            p_market_key: marketKey(args.intent),
            p_match_count: limit,
            p_min_similarity: minSimilarity,
            p_embedding_version: embeddingVersion,
          },
        );

        if (error) throw new Error(error.message);
        return {
          domain: expectedDomain,
          rows: Array.isArray(data) ? data as SearchMatchRow[] : [],
        };
      }),
    );

    const byLocation = new Map<string, {
      score: number;
      domains: Set<string>;
    }>();

    for (const result of results) {
      for (const row of result.rows) {
        const score = nullableNumber(row.similarity);
        if (score == null || score < minSimilarity) continue;

        const current = byLocation.get(row.location_id) ?? {
          score,
          domains: new Set<string>(),
        };
        current.score = Math.max(current.score, score);
        current.domains.add(result.domain);
        byLocation.set(row.location_id, current);
      }
    }

    const ranked = [...byLocation.entries()]
      .sort((a, b) =>
        b[1].score - a[1].score ||
        a[0].localeCompare(b[0])
      )
      .slice(0, limit);

    const candidates: RetrievalCandidate[] = ranked.map(
      ([locationId, value], index) => ({
        locationId,
        lane: "semantic_dense",
        rank: index + 1,
        score: value.score,
        evidence: [
          `similarity:${value.score.toFixed(4)}`,
          `model:${embedding.model}`,
          `version:${embeddingVersion}`,
          ...[...value.domains].sort().map((domain) => `domain:${domain}`),
        ],
        metadata: {
          semanticModel: embedding.model,
          semanticVersion: embeddingVersion,
          provider: "azure",
          semanticDomains: [...value.domains].sort(),
        },
      }),
    );

    return {
      lane: "semantic_dense",
      candidates,
      elapsedMs: Date.now() - startedAt,
      truncated: results.some((result) => result.rows.length >= limit),
    };
  }
}

export function buildSemanticQueryText(intent: SearchIntentGraph): string {
  const lines = [intent.rawQuery.trim()];

  for (const constraint of intent.constraints) {
    lines.push(
      constraint.key.replace(/_/g, " ") + ": " + String(constraint.value),
    );
  }

  if (intent.occasion) lines.push("occasion: " + intent.occasion);
  if (intent.anchor?.label) lines.push("near: " + intent.anchor.label);

  return [...new Set(lines.filter(Boolean))].join("\n");
}

export function semanticDomains(
  intent: SearchIntentGraph,
): Array<"restaurant" | "activity"> {
  const domains: Array<"restaurant" | "activity"> = [];
  if (intent.domains.includes("restaurant")) domains.push("restaurant");
  if (intent.domains.includes("activity") || intent.domains.includes("nightlife")) {
    domains.push("activity");
  }
  return [...new Set(domains)];
}

function marketKey(intent: SearchIntentGraph): string | null {
  const explicit = intent.constraints.find(
    (constraint) => constraint.key === "market",
  );
  return explicit == null ? null : String(explicit.value);
}

function nullableNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}
