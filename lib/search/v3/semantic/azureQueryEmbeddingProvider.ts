import type {
  SearchQueryEmbedding,
  SearchQueryEmbeddingProvider,
} from "@/lib/search-framework";
import { createAzureFoundryProvider } from "@/lib/ai/gateway/providers/azure-foundry";

export interface AzureQueryEmbeddingProviderOptions {
  deployment?: string;
  vectorModel?: string;
  version?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

const inFlight = new Map<string, Promise<SearchQueryEmbedding>>();

export class AzureQueryEmbeddingProvider implements SearchQueryEmbeddingProvider {
  readonly providerId = "theouthaven.azure-query-embedding.v1";
  private readonly deployment: string;
  private readonly vectorModel: string;
  private readonly version: string;
  private readonly timeoutMs: number;
  private readonly provider: ReturnType<typeof createAzureFoundryProvider>;

  constructor(options: AzureQueryEmbeddingProviderOptions = {}) {
    const env = options.env ?? process.env;
    this.deployment = String(
      options.deployment ??
      env.AZURE_AI_EMBEDDING_MODEL ??
      "toh-embedding"
    ).trim();
    this.vectorModel = String(
      options.vectorModel ??
      env.SEARCH_EMBEDDING_MODEL ??
      "text-embedding-3-small"
    ).trim();
    this.version = String(
      options.version ??
      env.SEARCH_EMBEDDING_VERSION ??
      "search-embedding:v1"
    ).trim();
    this.timeoutMs = Math.max(250, options.timeoutMs ?? 2500);
    this.provider = createAzureFoundryProvider(env);
  }

  async embed(text: string): Promise<SearchQueryEmbedding> {
    const normalized = String(text ?? "").trim();
    if (!normalized) throw new Error("Semantic query text was empty.");

    const key = this.deployment + ":" + this.vectorModel + ":" + normalized.toLowerCase();
    const existing = inFlight.get(key);
    if (existing) return existing;

    const request = (async () => {
      const result = await this.provider.invoke<string, number[][]>({
        capability: "embed",
        input: normalized,
        model: this.deployment,
        timeoutMs: this.timeoutMs,
      });

      const vector = Array.isArray(result.output?.[0])
        ? result.output[0].map(Number)
        : null;

      if (!vector?.length || !vector.every(Number.isFinite)) {
        throw new Error("Azure embedding response was empty or invalid.");
      }

      return {
        vector,
        model: this.vectorModel,
        version: this.version,
      };
    })().finally(() => {
      inFlight.delete(key);
    });

    inFlight.set(key, request);
    return request;
  }
}
