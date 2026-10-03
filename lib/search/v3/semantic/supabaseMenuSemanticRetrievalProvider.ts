import type {
  RetrievalCandidate,
  RetrievalLaneResult,
  SearchIntentGraph,
  SearchQueryEmbeddingProvider,
  SearchRetrievalProvider,
  SearchV3Request,
} from "@/lib/search-framework";
import type { SemanticRpcClient } from "./supabaseSemanticRetrievalProvider";
import { buildSemanticQueryText } from "./supabaseSemanticRetrievalProvider";

export interface MenuSemanticRetrievalOptions {
  candidateLimit?: number;
  minSimilarity?: number;
}

type MenuMatchRow = {
  location_id: string;
  item_name: string | null;
  source: string | null;
  similarity: number | string | null;
};

export class SupabaseMenuSemanticRetrievalProvider implements SearchRetrievalProvider {
  readonly providerId = "theouthaven.supabase-semantic-menu.v1";

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

    if (!hasMenuIntent(args.intent)) {
      return {
        lane: "semantic_menu",
        candidates: [],
        elapsedMs: Date.now() - startedAt,
      };
    }

    const embedding = await this.embeddings.embed(buildSemanticQueryText(args.intent));
    const rawLimit = clamp((this.options.candidateLimit ?? 100) * 3, 30, 150);
    const minSimilarity = this.options.minSimilarity ?? 0.55;

    const { data, error } = await this.client.rpc(
      "match_hf_location_menu_items",
      {
        p_query_embedding: [...embedding.vector],
        p_market_key: marketKey(args.intent),
        p_match_count: rawLimit,
        p_min_similarity: minSimilarity,
        p_embedding_version: embedding.version,
      },
    );

    if (error) throw new Error(error.message);

    const rows = Array.isArray(data) ? data as MenuMatchRow[] : [];
    const byLocation = new Map<string, {
      score: number;
      items: Array<{ name: string; source: string | null; similarity: number }>;
    }>();

    for (const row of rows) {
      const similarity = nullableNumber(row.similarity);
      if (similarity == null || similarity < minSimilarity) continue;
      const current = byLocation.get(row.location_id) ?? { score: similarity, items: [] };
      current.score = Math.max(current.score, similarity);
      if (row.item_name) {
        current.items.push({
          name: row.item_name,
          source: row.source,
          similarity,
        });
      }
      byLocation.set(row.location_id, current);
    }

    const limit = clamp(this.options.candidateLimit ?? 100, 20, 150);
    const ranked = [...byLocation.entries()]
      .sort((a, b) =>
        b[1].score - a[1].score ||
        a[0].localeCompare(b[0])
      )
      .slice(0, limit);

    const candidates: RetrievalCandidate[] = ranked.map(([locationId, value], index) => ({
      locationId,
      lane: "semantic_menu",
      rank: index + 1,
      score: value.score,
      evidence: value.items
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 5)
        .map((item) => `menu:${item.name}`),
      metadata: {
        semanticModel: embedding.model,
        semanticVersion: embedding.version,
        menuMatches: value.items
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 10),
      },
    }));

    return {
      lane: "semantic_menu",
      candidates,
      elapsedMs: Date.now() - startedAt,
      truncated: rows.length >= rawLimit,
    };
  }
}

function hasMenuIntent(intent: SearchIntentGraph): boolean {
  return intent.primaryDomain === "restaurant" && intent.constraints.some((constraint) =>
    constraint.key === "food"
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
