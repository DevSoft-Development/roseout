import type {
  SearchQueryEmbedding,
  SearchQueryEmbeddingProvider,
} from "@/lib/search-framework";
import {
  fetchHuggingFaceEmbedding,
  resolveSearchMlRuntimeConfig,
} from "@/lib/search/huggingFaceEmbedding";

const inFlight = new Map<string, Promise<SearchQueryEmbedding>>();

export class HuggingFaceQueryEmbeddingProvider
implements SearchQueryEmbeddingProvider {
  readonly providerId = "theouthaven.hf-query-embedding.v1";

  async embed(text: string): Promise<SearchQueryEmbedding> {
    const normalized = String(text ?? "").trim();
    if (!normalized) throw new Error("Semantic query text was empty.");

    const existing = inFlight.get(normalized);
    if (existing) return existing;

    const request = (async () => {
      const [vector, config] = await Promise.all([
        fetchHuggingFaceEmbedding(normalized),
        resolveSearchMlRuntimeConfig(),
      ]);

      return {
        vector,
        model: config.embeddingModel,
        version: config.embeddingVersion,
      };
    })().finally(() => {
      inFlight.delete(normalized);
    });

    inFlight.set(normalized, request);
    return request;
  }
}
