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
  lane?: "semantic_dense" | "semantic_food";
  candidateLimit?: number;
  minSimilarity?: number;
}

type SearchMatchRow = {
  location_id: string;
  similarity: number | string | null;
  semantic_similarity: number | string | null;
  food_similarity: number | string | null;
};

export class SupabaseSemanticRetrievalProvider implements SearchRetrievalProvider {
  readonly providerId: string;
  private readonly lane: "semantic_dense" | "semantic_food";

  constructor(
    private readonly client: SemanticRpcClient,
    private readonly embeddings: SearchQueryEmbeddingProvider,
    private readonly options: SemanticRetrievalOptions = {},
  ) {
    this.lane = options.lane ?? "semantic_dense";
    this.providerId = `theouthaven.supabase-${this.lane}.v1`;
  }

  async retrieve(args: {
    request: SearchV3Request;
    intent: SearchIntentGraph;
  }): Promise<RetrievalLaneResult> {
    const startedAt = Date.now();

    if (this.lane === "semantic_food" && !hasFoodIntent(args.intent)) {
      return {
        lane: this.lane,
        candidates: [],
        elapsedMs: Date.now() - startedAt,
      };
    }

    const expectedDomain = expectedSemanticDomain(args.intent);
    if (!expectedDomain) {
      return {
        lane: this.lane,
        candidates: [],
        elapsedMs: Date.now() - startedAt,
      };
    }

    const queryText = buildSemanticQueryText(args.intent);
    const embedding = await this.embeddings.embed(queryText);
    const limit = clamp(this.options.candidateLimit ?? 200, 20, 250);
    const threshold = this.options.minSimilarity ?? (this.lane === "semantic_food" ? 0.52 : 0.5);

    const { data, error } = await this.client.rpc(
      "match_hf_location_search_embeddings",
      {
        p_query_embedding: [...embedding.vector],
        p_expected_domain: expectedDomain,
        p_market_key: marketKey(args.intent),
        p_match_count: limit,
        p_min_similarity: threshold,
        p_embedding_version: embedding.version,
        p_food_intent: this.lane === "semantic_food",
      },
    );

    if (error) throw new Error(error.message);

    const rows = Array.isArray(data) ? data as SearchMatchRow[] : [];
    const scored = rows
      .map((row) => ({
        row,
        score: this.lane === "semantic_food"
          ? nullableNumber(row.food_similarity)
          : nullableNumber(row.semantic_similarity) ?? nullableNumber(row.similarity),
      }))
      .filter((entry): entry is { row: SearchMatchRow; score: number } =>
        entry.score != null && entry.score >= threshold
      )
      .sort((a, b) =>
        b.score - a.score ||
        a.row.location_id.localeCompare(b.row.location_id)
      )
      .slice(0, limit);

    const candidates: RetrievalCandidate[] = scored.map((entry, index) => ({
      locationId: entry.row.location_id,
      lane: this.lane,
      rank: index + 1,
      score: entry.score,
      evidence: [
        `similarity:${entry.score.toFixed(4)}`,
        `embedding:${embedding.version}`,
      ],
      metadata: {
        semanticModel: embedding.model,
        semanticVersion: embedding.version,
        denseSimilarity: nullableNumber(entry.row.semantic_similarity),
        foodSimilarity: nullableNumber(entry.row.food_similarity),
      },
    }));

    return {
      lane: this.lane,
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
      `${constraint.key.replace(/_/g, " ")}: ${String(constraint.value)}`,
    );
  }

  if (intent.occasion) lines.push(`occasion: ${intent.occasion}`);
  if (intent.anchor?.label) lines.push(`near: ${intent.anchor.label}`);

  return [...new Set(lines.filter(Boolean))].join("\n");
}

function expectedSemanticDomain(intent: SearchIntentGraph): "restaurant" | "activity" | null {
  if (intent.primaryDomain === "restaurant") return "restaurant";
  if (intent.primaryDomain === "activity" || intent.primaryDomain === "nightlife") {
    return "activity";
  }
  return null;
}

function hasFoodIntent(intent: SearchIntentGraph): boolean {
  return intent.primaryDomain === "restaurant" && intent.constraints.some((constraint) =>
    constraint.key === "food" ||
    constraint.key === "cuisine" ||
    constraint.key === "meal_period"
  );
}

function marketKey(intent: SearchIntentGraph): string | null {
  const explicit = intent.constraints.find((constraint) => constraint.key === "market");
  return explicit == null ? null : String(explicit.value);
}

function nullableNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}
