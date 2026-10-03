import type {
  LocationIntelligenceProvider,
  SearchEligibilityProvider,
  SearchEntityResolutionProvider,
  SearchFusionProvider,
  SearchIntentProvider,
  SearchRetrievalProvider,
} from "@/lib/search-framework";
import {
  createSearchV3Orchestrator,
  GraphEntityResolver,
  ReciprocalRankFusionProvider,
  RuleBasedSearchV3IntentProvider,
  SearchProfileLocationIntelligenceProvider,
  SupabaseBm25RetrievalProvider,
  SupabaseHardEligibilityProvider,
  SupabaseKnowledgeGraphProvider,
  SupabaseStructuredRetrievalProvider,
  createSearchV3SemanticRetrievalBundle,
  type ReciprocalRankFusionOptions,
  type SearchV3Orchestrator,
  type SearchV3SemanticRetrievalBundleOptions,
} from "@/lib/search/v3";
import {
  SupabaseLocationSearchProfileLoader,
  type SupabaseLocationSearchProfileLoaderClient,
} from "./supabaseLocationSearchProfileLoader";

export interface TheOutHavenSearchV3Client
extends SupabaseLocationSearchProfileLoaderClient {
  rpc(functionName: string, args?: Record<string, unknown>): Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
}

export interface TheOutHavenSearchV3CompositionOptions {
  intent?: SearchIntentProvider;
  entityResolution?: SearchEntityResolutionProvider | null;
  locationIntelligence?: LocationIntelligenceProvider;
  retrievalProviders?: readonly SearchRetrievalProvider[];
  eligibility?: SearchEligibilityProvider | null;
  fusion?: SearchFusionProvider | null;
  semantic?: SearchV3SemanticRetrievalBundleOptions;
  rrf?: ReciprocalRankFusionOptions;
}

export interface TheOutHavenSearchV3Composition {
  orchestrator: SearchV3Orchestrator;
  retrievalProviders: readonly SearchRetrievalProvider[];
}

export function createTheOutHavenSearchV3(
  client: TheOutHavenSearchV3Client,
  options: TheOutHavenSearchV3CompositionOptions = {},
): TheOutHavenSearchV3Composition {
  const locationIntelligence =
    options.locationIntelligence ??
    new SearchProfileLocationIntelligenceProvider(
      new SupabaseLocationSearchProfileLoader(client),
    );

  const entityResolution =
    options.entityResolution === undefined
      ? new GraphEntityResolver(new SupabaseKnowledgeGraphProvider(client))
      : options.entityResolution;

  const retrievalProviders =
    options.retrievalProviders ?? createDefaultRetrievalProviders(client, options);

  const fusion =
    options.fusion === undefined
      ? new ReciprocalRankFusionProvider(options.rrf)
      : options.fusion;

  const eligibility =
    options.eligibility === undefined
      ? new SupabaseHardEligibilityProvider(client)
      : options.eligibility;

  return {
    retrievalProviders,
    orchestrator: createSearchV3Orchestrator({
      intent: options.intent ?? new RuleBasedSearchV3IntentProvider(),
      entityResolution,
      locationIntelligence,
      retrieval: retrievalProviders,
      fusion,
      eligibility,
    }),
  };
}

export function createDefaultRetrievalProviders(
  client: TheOutHavenSearchV3Client,
  options: Pick<TheOutHavenSearchV3CompositionOptions, "semantic"> = {},
): readonly SearchRetrievalProvider[] {
  const semantic = createSearchV3SemanticRetrievalBundle(client, options.semantic);

  return [
    new SupabaseStructuredRetrievalProvider(client),
    new SupabaseBm25RetrievalProvider(client),
    ...semantic.providers,
  ];
}
