import type {
  SearchQueryEmbedding,
  SearchQueryEmbeddingProvider,
  SearchRetrievalProvider,
} from "@/lib/search-framework";
import {
  AzureQueryEmbeddingProvider,
  type AzureQueryEmbeddingProviderOptions,
} from "./azureQueryEmbeddingProvider";
import {
  SupabaseSemanticRetrievalProvider,
  type SemanticRetrievalOptions,
  type SemanticRpcClient,
} from "./supabaseSemanticRetrievalProvider";
import {
  SupabaseFoodSemanticRetrievalProvider,
  type FoodSemanticRetrievalOptions,
} from "./supabaseFoodSemanticRetrievalProvider";
import {
  SupabaseMenuSemanticRetrievalProvider,
  type MenuSemanticRetrievalOptions,
} from "./supabaseMenuSemanticRetrievalProvider";

export interface SearchV3SemanticRetrievalBundleOptions {
  embeddings?: SearchQueryEmbeddingProvider;
  azureEmbeddings?: AzureQueryEmbeddingProviderOptions;
  dense?: SemanticRetrievalOptions;
  food?: FoodSemanticRetrievalOptions;
  menu?: MenuSemanticRetrievalOptions;
}

export interface SearchV3SemanticRetrievalBundle {
  embeddings: SearchQueryEmbeddingProvider;
  providers: readonly SearchRetrievalProvider[];
}

export class CoalescingQueryEmbeddingProvider
implements SearchQueryEmbeddingProvider {
  readonly providerId: string;
  private readonly inFlight = new Map<string, Promise<SearchQueryEmbedding>>();

  constructor(private readonly delegate: SearchQueryEmbeddingProvider) {
    this.providerId = `coalesced:${delegate.providerId}`;
  }

  async embed(text: string): Promise<SearchQueryEmbedding> {
    const normalized = String(text ?? "").trim();
    if (!normalized) throw new Error("Semantic query text was empty.");

    const key = normalized.toLowerCase();
    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const request = this.delegate.embed(normalized).finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, request);
    return request;
  }
}

export function createSearchV3SemanticRetrievalBundle(
  client: SemanticRpcClient,
  options: SearchV3SemanticRetrievalBundleOptions = {},
): SearchV3SemanticRetrievalBundle {
  const baseEmbeddings =
    options.embeddings ?? new AzureQueryEmbeddingProvider(options.azureEmbeddings);
  const embeddings = new CoalescingQueryEmbeddingProvider(baseEmbeddings);

  return {
    embeddings,
    providers: [
      new SupabaseSemanticRetrievalProvider(client, embeddings, options.dense),
      new SupabaseFoodSemanticRetrievalProvider(client, embeddings, options.food),
      new SupabaseMenuSemanticRetrievalProvider(client, embeddings, options.menu),
    ],
  };
}
