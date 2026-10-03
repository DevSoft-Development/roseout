import type {
  RetrievalCandidate,
  RetrievalLaneResult,
  SearchIntentGraph,
  SearchQueryEmbeddingProvider,
  SearchRetrievalProvider,
  SearchV3Request,
} from "@/lib/search-framework";
import {
  buildSemanticQueryText,
  type SemanticRpcClient,
} from "./supabaseSemanticRetrievalProvider";

export interface FoodSemanticRetrievalOptions {
  candidateLimit?: number;
  minSimilarity?: number;
  embeddingVersion?: string;
  expectedEmbeddingModel?: string;
}

type FoodMatchRow = {
  location_id: string;
  similarity: number | string | null;
};

export class SupabaseFoodSemanticRetrievalProvider
implements SearchRetrievalProvider {
  readonly providerId = "theouthaven.supabase-semantic-food.azure.v1";

  constructor(
    private readonly client: SemanticRpcClient,
    private readonly embeddings: SearchQueryEmbeddingProvider,
    private readonly options: FoodSemanticRetrievalOptions = {},
  ) {}

  async retrieve(args: {
    request: SearchV3Request;
    intent: SearchIntentGraph;
  }): Promise<RetrievalLaneResult> {
    const startedAt = Date.now();

    if (!hasFoodIntent(args.intent)) {
      return {
        lane: "semantic_food",
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
        `Food semantic vector-space mismatch: query model ${embedding.model} does not match index model ${expectedModel}.`,
      );
    }

    const embeddingVersion =
      this.options.embeddingVersion ??
      process.env.SEARCH_FOOD_MENU_EMBEDDING_VERSION ??
      "azure-text-embedding-3-small:v1";
    const limit = clamp(this.options.candidateLimit ?? 200, 20, 250);
    const minSimilarity = this.options.minSimilarity ?? 0.55;

    const { data, error } = await this.client.rpc(
      "match_location_food_embeddings",
      {
        p_query_embedding: [...embedding.vector],
        p_market_key: marketKey(args.intent),
        p_match_count: limit,
        p_min_similarity: minSimilarity,
        p_embedding_version: embeddingVersion,
      },
    );

    if (error) throw new Error(error.message);

    const rows = Array.isArray(data) ? (data as FoodMatchRow[]) : [];
    const ranked = rows
      .map((row) => ({
        row,
        score: nullableNumber(row.similarity),
      }))
      .filter(
        (entry): entry is { row: FoodMatchRow; score: number } =>
          entry.score != null && entry.score >= minSimilarity,
      )
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.row.location_id.localeCompare(b.row.location_id),
      )
      .slice(0, limit);

    const candidates: RetrievalCandidate[] = ranked.map((entry, index) => ({
      locationId: entry.row.location_id,
      lane: "semantic_food",
      rank: index + 1,
      score: entry.score,
      evidence: [
        `food_similarity:${entry.score.toFixed(4)}`,
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
      lane: "semantic_food",
      candidates,
      elapsedMs: Date.now() - startedAt,
      truncated: rows.length >= limit,
    };
  }
}

function hasFoodIntent(intent: SearchIntentGraph): boolean {
  return (
    intent.primaryDomain === "restaurant" &&
    intent.constraints.some(
      (constraint) =>
        constraint.key === "food" ||
        constraint.key === "cuisine" ||
        constraint.key === "meal_period",
    )
  );
}

function marketKey(intent: SearchIntentGraph): string | null {
  const explicit = intent.constraints.find(
    (constraint) => constraint.key === "market",
  );
  return explicit == null ? null : String(explicit.value);
}

function nullableNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}
