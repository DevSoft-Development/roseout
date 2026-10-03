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
    const expectedDomain = semanticDomain(args.intent);

    if (!expectedDomain) {
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
      this.options.embeddingVersion ?? embedding.version ?? "search-embedding:v1";
    const limit = clamp(this.options.candidateLimit ?? 200, 20, 250);
    const minSimilarity = this.options.minSimilarity ?? 0.55;

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

    const rows = Array.isArray(data) ? data as SearchMatchRow[] : [];
    const ranked = rows
      .map((row) => ({
        row,
        score: nullableNumber(row.similarity),
      }))
      .filter((entry): entry is { row: SearchMatchRow; score: number } =>
        entry.score != null && entry.score >= minSimilarity
      )
      .sort((a, b) =>
        b.score - a.score ||
        a.row.location_id.localeCompare(b.row.location_id)
      )
      .slice(0, limit);

    const candidates: RetrievalCandidate[] = ranked.map((entry, index) => ({
      locationId: entry.row.location_id,
      lane: "semantic_dense",
      rank: index + 1,
      score: entry.score,
      evidence: [
        `similarity:${entry.score.toFixed(4)}`,
        `model:${embedding.model}`,
        `version:${embeddingVersion}`,
      ],
      metadata: {
        semanticModel: embedding.model,
        semanticVersion: embeddingVersion,
        provider: "azure",
      },
    }));

    return {
      lane: "semantic_dense",
      candidates,
      elapsedMs: Date.now() - startedAt,
      truncated: rows.length >= limit,
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

function semanticDomain(
  intent: SearchIntentGraph,
): "restaurant" | "activity" | null {
  if (intent.primaryDomain === "restaurant") return "restaurant";
  if (intent.primaryDomain === "activity" || intent.primaryDomain === "nightlife") {
    return "activity";
  }
  return null;
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
