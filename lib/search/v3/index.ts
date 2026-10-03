export {
  createSearchV3Orchestrator,
  SEARCH_V3_ORCHESTRATION_VERSION,
  type SearchV3Dependencies,
  type SearchV3Orchestrator,
} from "./orchestration/createSearchV3Orchestrator";

export {
  SearchProfileLocationIntelligenceProvider,
  toLocationIntelligenceProfile,
  type LocationSearchProfileLoader,
} from "./theouthaven-adapters/locationIntelligenceAdapter";

export {
  SupabaseKnowledgeGraphProvider,
  normalizeAlias,
  type KnowledgeGraphSupabaseClient,
} from "./theouthaven-adapters/supabaseKnowledgeGraphProvider";

export {
  upsertLocationIntelligenceIntoKnowledgeGraph,
  type KnowledgeGraphMutationClient,
} from "./theouthaven-adapters/knowledgeGraphIngestion";

export {
  GraphEntityResolver,
  type GraphEntityResolverOptions,
} from "./entity-resolution/graphEntityResolver";

export {
  RuleBasedSearchV3IntentProvider,
} from "./intent/ruleBasedIntentProvider";

export {
  SupabaseStructuredRetrievalProvider,
  type StructuredRetrievalOptions,
  type StructuredRetrievalSupabaseClient,
} from "./retrieval/supabaseStructuredRetrievalProvider";

export {
  SupabaseHardEligibilityProvider,
  type EligibilitySupabaseClient,
} from "./eligibility/supabaseHardEligibilityProvider";

export {
  SupabaseBm25RetrievalProvider,
  bm25Score,
  type Bm25RetrievalOptions,
  type Bm25SupabaseClient,
} from "./retrieval/supabaseBm25RetrievalProvider";

export {
  ReciprocalRankFusionProvider,
  reciprocalRankFusion,
  type ReciprocalRankFusionOptions,
} from "./fusion/reciprocalRankFusionProvider";

export {
  AzureQueryEmbeddingProvider,
  type AzureQueryEmbeddingProviderOptions,
} from "./semantic/azureQueryEmbeddingProvider";

export {
  SupabaseSemanticRetrievalProvider,
  buildSemanticQueryText,
  type SemanticRetrievalOptions,
  type SemanticRpcClient,
} from "./semantic/supabaseSemanticRetrievalProvider";

export {
  SupabaseFoodSemanticRetrievalProvider,
  type FoodSemanticRetrievalOptions,
} from "./semantic/supabaseFoodSemanticRetrievalProvider";

export {
  SupabaseMenuSemanticRetrievalProvider,
  type MenuSemanticRetrievalOptions,
} from "./semantic/supabaseMenuSemanticRetrievalProvider";
export {
  CoalescingQueryEmbeddingProvider,
  createSearchV3SemanticRetrievalBundle,
  type SearchV3SemanticRetrievalBundle,
  type SearchV3SemanticRetrievalBundleOptions,
} from "./semantic/createSemanticRetrievalBundle";
export {
  SupabaseLocationSearchProfileLoader,
  type SupabaseLocationSearchProfileLoaderClient,
} from "./theouthaven-adapters/supabaseLocationSearchProfileLoader";

export {
  createDefaultRetrievalProviders,
  createTheOutHavenSearchV3,
  type TheOutHavenSearchV3Client,
  type TheOutHavenSearchV3Composition,
  type TheOutHavenSearchV3CompositionOptions,
} from "./theouthaven-adapters/createTheOutHavenSearchV3";

export {
  DeterministicDecisionRankingProvider,
  type DeterministicDecisionRankingOptions,
} from "./ranking/deterministicDecisionRankingProvider";

export {
  DeterministicOutingPairingProvider,
  estimateTravelMinutes,
  pairDistanceMiles,
  requiresOutingPair,
  type DeterministicOutingPairingOptions,
} from "./pairing/deterministicOutingPairingProvider";

export {
  MapboxSearchRoutingProvider,
  createMapboxSearchRoutingProviderFromEnvironment,
  type MapboxSearchRoutingProviderOptions,
} from "./routing/mapboxRoutingProvider";
