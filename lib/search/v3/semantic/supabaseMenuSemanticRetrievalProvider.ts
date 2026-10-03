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

export interface MenuSemanticRetrievalOptions {
  candidateLimit?: number;
  rawMatchLimit?: number;
  minSimilarity?: number;
  embeddingVersion?: string;
  expectedEmbeddingModel?: string;
}

type MenuMatchRow = {
  location_id: string;
  item_name: string | null;
  source: string | null;
  similarity: number | string | null;
};

export class SupabaseMenuSemanticRetrievalProvider
implements SearchRetrievalProvider {
  readonly providerId = "theouthaven.supabase-semantic-menu.azure.v1";

  constructor(
    private readonly client: SemanticRpcClient,
    private readonly embeddings: SearchQueryEmbeddingProvider,
    private readonly options: MenuSemanticRetrievalOptions = {},
  ) {}

  async retrieve(args: {
    request: SearchV3Request;
    intent: SearchIntentGraph;
  }): Promise<RetrievalLaneResult> {
    const startedAt = Date.now();

    if (!hasExplicitFoodIntent(args.intent)) {
      return {
        lane: "semantic_menu",
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
        `Menu semantic vector-space mismatch: query model ${embedding.model} does not match index model ${expectedModel}.`,
      );
    }

    const embeddingVersion =
      this.options.embeddingVersion ??
      process.env.SEARCH_FOOD_MENU_EMBEDDING_VERSION ??
      "azure-text-embedding-3-small:v1";
    const rawLimit = clamp(this.options.rawMatchLimit ?? 250, 20, 250);
    const candidateLimit = clamp(this.options.candidateLimit ?? 100, 20, 250);
    const minSimilarity = this.options.minSimilarity ?? 0.55;

    const { data, error } = await this.client.rpc(
      "match_location_menu_items",
      {
        p_query_embedding: [...embedding.vector],
        p_market_key: marketKey(args.intent),
        p_match_count: rawLimit,
        p_min_similarity: minSimilarity,
        p_embedding_version: embeddingVersion,
      },
    );

    if (error) throw new Error(error.message);

    const rows = Array.isArray(data) ? (data as MenuMatchRow[]) : [];
    const byLocation = new Map<
      string,
      {
        bestScore: number;
        matches: Array<{
          itemName: string;
          source: string | null;
          similarity: number;
        }>;
      }
    >();

    for (const row of rows) {
      const similarity = nullableNumber(row.similarity);
      if (similarity == null || similarity < minSimilarity) continue;

      const current = byLocation.get(row.location_id) ?? {
        bestScore: similarity,
        matches: [],
      };
      current.bestScore = Math.max(current.bestScore, similarity);

      if (row.item_name) {
        current.matches.push({
          itemName: row.item_name,
          source: row.source,
          similarity,
        });
      }

      byLocation.set(row.location_id, current);
    }

    const ranked = [...byLocation.entries()]
      .sort(
        (a, b) =>
          b[1].bestScore - a[1].bestScore ||
          a[0].localeCompare(b[0]),
      )
      .slice(0, candidateLimit);

    const candidates: RetrievalCandidate[] = ranked.map(
      ([locationId, value], index) => {
        const matches = [...value.matches]
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 10);

        return {
          locationId,
          lane: "semantic_menu",
          rank: index + 1,
          score: value.bestScore,
          evidence: matches
            .slice(0, 5)
            .map((match) => `menu:${match.itemName}`),
          metadata: {
            provider: "azure",
            semanticModel: embedding.model,
            semanticVersion: embeddingVersion,
            menuMatches: matches,
          },
        };
      },
    );

    return {
      lane: "semantic_menu",
      candidates,
      elapsedMs: Date.now() - startedAt,
      truncated: rows.length >= rawLimit,
    };
  }
}

function hasExplicitFoodIntent(intent: SearchIntentGraph): boolean {
  return (
    intent.primaryDomain === "restaurant" &&
    intent.constraints.some((constraint) => constraint.key === "food")
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
