import type {
  LocationIntelligenceProvider,
  SearchEligibilityProvider,
  SearchEntityResolutionProvider,
  SearchFusionProvider,
  SearchIntentProvider,
  SearchPairingProvider,
  SearchRetrievalProvider,
  SearchRankingProvider,
} from "@/lib/search-framework";
import {
  createSearchV3Orchestrator,
  type SearchV3Orchestrator,
} from "../orchestration/createSearchV3Orchestrator";
import { GraphEntityResolver } from "../entity-resolution/graphEntityResolver";
import {
  ReciprocalRankFusionProvider,
  type ReciprocalRankFusionOptions,
} from "../fusion/reciprocalRankFusionProvider";
import { RuleBasedSearchV3IntentProvider } from "../intent/ruleBasedIntentProvider";
import { SupabaseBm25RetrievalProvider } from "../retrieval/supabaseBm25RetrievalProvider";
import { SupabaseStructuredRetrievalProvider } from "../retrieval/supabaseStructuredRetrievalProvider";
import { SupabaseHardEligibilityProvider } from "../eligibility/supabaseHardEligibilityProvider";
import {
  DeterministicDecisionRankingProvider,
  type DeterministicDecisionRankingOptions,
} from "../ranking/deterministicDecisionRankingProvider";
import {
  DeterministicOutingPairingProvider,
  type DeterministicOutingPairingOptions,
} from "../pairing/deterministicOutingPairingProvider";
import {
  createSearchV3SemanticRetrievalBundle,
  type SearchV3SemanticRetrievalBundleOptions,
} from "../semantic/createSemanticRetrievalBundle";
import {
  SearchProfileLocationIntelligenceProvider,
} from "./locationIntelligenceAdapter";
import { SupabaseKnowledgeGraphProvider } from "./supabaseKnowledgeGraphProvider";
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
  ranking?: SearchRankingProvider | null;
  pairing?: SearchPairingProvider | null;
  semantic?: SearchV3SemanticRetrievalBundleOptions;
  rrf?: ReciprocalRankFusionOptions;
  decisionRanking?: DeterministicDecisionRankingOptions;
  outingPairing?: DeterministicOutingPairingOptions;
}

export interface TheOutHavenSearchV3Composition {
  orchestrator: SearchV3Orchestrator;
  retrievalProviders: readonly SearchRetrievalProvider[];
  pairingProvider: SearchPairingProvider | null;
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

  const ranking =
    options.ranking === undefined
      ? new DeterministicDecisionRankingProvider(options.decisionRanking)
      : options.ranking;

  const pairing =
    options.pairing === undefined
      ? new DeterministicOutingPairingProvider(options.outingPairing)
      : options.pairing;

  return {
    retrievalProviders,
    pairingProvider: pairing,
    orchestrator: createSearchV3Orchestrator({
      intent: options.intent ?? new RuleBasedSearchV3IntentProvider(),
      entityResolution,
      locationIntelligence,
      retrieval: retrievalProviders,
      fusion,
      eligibility,
      ranking,
      pairing,
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
