import { searchV2 as coreSearchV2 } from "./v2/index";
import {
  applyLanguageConstraintsToResponse,
  understandSearchQuery,
} from "./v2/languageRuntime";
import { applyConversationalRefinement } from "./v2/planner/languageUnderstanding";
import { removeExcludedTaxonomyTerms } from "./v2/planner/negativeIntentInvariant";
import {
  loadLearnedLanguageIntent,
  recordAndMaybePromoteLearnedIntent,
} from "./v2/planner/learnedLanguage";

export * from "./v2/index";

type SearchV2Input = Parameters<typeof coreSearchV2>[0];
type SearchV2Response = Awaited<ReturnType<typeof coreSearchV2>>;
type SearchV2Executor = (input: SearchV2Input) => Promise<SearchV2Response>;
type ExecutionMode = "served" | "strict";

const REPLAY_MODE_SUFFIX = /:(canonical|strict)$/;

function executionMode(input: SearchV2Input): ExecutionMode {
  return input.rolloutOverride?.strictNoFallback === true ? "strict" : "served";
}

function sharedExecutionKey(input: SearchV2Input) {
  const requestId = String(input.requestId ?? "");
  if (!REPLAY_MODE_SUFFIX.test(requestId)) return null;
  if (input.rolloutOverride?.mode !== "primary") return null;
  return `${requestId.replace(REPLAY_MODE_SUFFIX, "")}:${String(input.query ?? "").trim().toLowerCase()}`;
}

function sharedPipelineInput(input: SearchV2Input): SearchV2Input {
  const rolloutOverride = input.rolloutOverride
    ? { ...input.rolloutOverride, strictNoFallback: false }
    : input.rolloutOverride;
  return {
    ...input,
    requestId: String(input.requestId ?? "").replace(REPLAY_MODE_SUFFIX, ":shared"),
    rolloutOverride,
  };
}

function cloneResponse(response: SearchV2Response): SearchV2Response {
  if (typeof structuredClone === "function") return structuredClone(response);
  return JSON.parse(JSON.stringify(response)) as SearchV2Response;
}

function annotateResponse(response: SearchV2Response, mode: ExecutionMode, sharedExecutionId: string | null) {
  const cloned = cloneResponse(response) as any;
  cloned.debug = {
    ...(cloned.debug ?? {}),
    executionMode: mode,
    sharedExecutionId,
    sharedPipeline: sharedExecutionId != null,
    strictPolicy: mode === "strict"
      ? {
          evaluatesServedPipeline: true,
          legacyFallbackUsed: Boolean(cloned?.retrieval?.legacyFallbackUsed),
          fallbackDomains: Array.isArray(cloned?.retrieval?.fallbackDomains)
            ? cloned.retrieval.fallbackDomains
            : [],
        }
      : null,
  };
  return cloned as SearchV2Response;
}

export function createSearchV2ExecutionCoordinator(execute: SearchV2Executor) {
  const inFlight = new Map<string, Promise<SearchV2Response>>();

  return async function coordinatedSearchV2(input: SearchV2Input): Promise<SearchV2Response> {
    const mode = executionMode(input);
    const key = sharedExecutionKey(input);
    if (!key) return execute(input);

    let promise = inFlight.get(key);
    if (!promise) {
      promise = execute(sharedPipelineInput(input));
      inFlight.set(key, promise);
      void promise.finally(() => {
        setTimeout(() => inFlight.delete(key), 5_000);
      });
    }

    const response = await promise;
    return annotateResponse(response, mode, key);
  };
}

const coordinatedSearchV2 = createSearchV2ExecutionCoordinator(coreSearchV2);

function contextualQuery(input: SearchV2Input) {
  const currentQuery = String(input.query ?? "").trim();
  const refinement = applyConversationalRefinement(input.previousPlan, currentQuery);
  if (!refinement) {
    return {
      currentQuery,
      effectiveQuery: currentQuery,
      refinementUsed: false,
      previousRequestId: null as string | null,
    };
  }

  let expansion = currentQuery;
  if (/\bcheaper\b/i.test(currentQuery)) expansion += " affordable budget";
  if (/\bcloser\b/i.test(currentQuery)) expansion += " nearby close";
  if (/\bquieter\b/i.test(currentQuery)) expansion += " quiet conversation friendly";
  if (/\blivelier\b/i.test(currentQuery)) expansion += " lively energetic";
  if (/\bwalkable\b|\bwalking\b/i.test(currentQuery)) expansion += " within walking distance";

  return {
    currentQuery,
    effectiveQuery: `${refinement.previous.rawQuery} ${expansion}`.trim(),
    refinementUsed: true,
    previousRequestId: refinement.previous.requestId,
  };
}

function applyLearnedIntentToQuery(query: string, learned: Awaited<ReturnType<typeof loadLearnedLanguageIntent>>) {
  if (!learned) return query;
  const additions: string[] = [];
  if (learned.relationship === "same_venue_required") additions.push("same venue");
  else if (learned.relationship === "same_venue_preferred") additions.push("preferably same venue");
  else if (learned.relationship === "sequential") additions.push("then");
  else if (learned.relationship === "proximity") additions.push("nearby");
  else if (learned.relationship === "separate_venues") additions.push("different places");
  additions.push(...learned.vibes);
  additions.push(...learned.exclusions.map((term) => `no ${term}`));
  return `${query} ${additions.join(" ")}`.trim();
}

export async function searchV2(input: SearchV2Input) {
  const conversation = contextualQuery(input);
  const learned = await loadLearnedLanguageIntent(input.supabase, conversation.effectiveQuery).catch(() => null);
  const learnedQuery = applyLearnedIntentToQuery(conversation.effectiveQuery, learned);
  const language = await understandSearchQuery(learnedQuery);
  if (learned) {
    language.originalQuery = conversation.effectiveQuery;
    language.effectiveQuery = applyLearnedIntentToQuery(conversation.effectiveQuery, learned);
    language.llmUsed = false;
    language.llmModel = null;
    language.llmConfidence = learned.confidence;
    language.llmRelationship = learned.relationship;
    language.llmSoftVibes = learned.vibes;
    language.llmAvoidTerms = learned.exclusions;
    language.relationship = {
      ...language.relationship,
      type: (learned.relationship ?? language.relationship.type) as typeof language.relationship.type,
      evidence: [...new Set([...language.relationship.evidence, "approved_learned_mapping"])],
    };
  }

  const beforeNegativeInvariant = language.effectiveQuery;
  language.effectiveQuery = removeExcludedTaxonomyTerms(
    language.effectiveQuery,
    [...language.negatives.restaurant, ...language.negatives.activity],
  );
  const negativeInvariantApplied = language.effectiveQuery !== beforeNegativeInvariant;
  if (negativeInvariantApplied) language.llmRewriteApplied = true;

  const effectiveInput = {
    ...input,
    query: language.effectiveQuery,
    restaurantExclusions: language.negatives.restaurant,
    activityExclusions: language.negatives.activity,
  } as SearchV2Input;
  const response = await coordinatedSearchV2(effectiveInput);
  const constrained = applyLanguageConstraintsToResponse(response, language) as SearchV2Response;
  const mutable = constrained as any;

  let learning = { recorded: false, promoted: false };
  if (!learned && language.llmUsed) {
    learning = await recordAndMaybePromoteLearnedIntent({
      supabase: input.supabase,
      query: conversation.effectiveQuery,
      relationship: language.relationship.type,
      vibes: language.preferences.vibes,
      exclusions: [...language.negatives.restaurant, ...language.negatives.activity, ...language.negatives.vibes],
      confidence: Number(language.llmConfidence ?? 0),
      llmModel: language.llmModel,
      ambiguityReasons: language.ambiguityReasons,
      successful: Boolean(mutable.success && mutable.requestFulfilled !== false),
    }).catch(() => ({ recorded: false, promoted: false }));
  }

  if (mutable.searchPlan) {
    mutable.searchPlan = {
      ...mutable.searchPlan,
      rawQuery: conversation.effectiveQuery,
      relationship: {
        type: language.relationship.type,
        evidence: language.relationship.evidence,
      },
      preferences: {
        vibes: language.preferences.vibes,
        avoidVibes: language.negatives.vibes,
        subjectiveTerms: language.preferences.subjectiveTerms,
        budget: language.preferences.budget,
        noise: language.preferences.noise,
      },
      restaurant: {
        ...mutable.searchPlan.restaurant,
        exclusions: language.negatives.restaurant,
      },
      activity: {
        ...mutable.searchPlan.activity,
        exclusions: language.negatives.activity,
      },
      parser: {
        ...mutable.searchPlan.parser,
        source: learned ? "deterministic" : language.llmUsed ? "hybrid" : mutable.searchPlan.parser?.source ?? "deterministic",
        reasons: [
          ...(mutable.searchPlan.parser?.reasons ?? []),
          ...language.relationship.evidence,
          ...language.ambiguityReasons,
          ...(conversation.refinementUsed ? ["conversational_refinement_applied"] : []),
          ...(learned ? ["learned_mapping_reused_no_llm"] : []),
          ...(negativeInvariantApplied ? ["negative_intent_invariant_applied"] : []),
        ],
        llmUsed: language.llmUsed,
        llmModel: language.llmModel,
        ambiguityReasons: language.ambiguityReasons,
      },
    };
  }
  mutable.debug = {
    ...(mutable.debug ?? {}),
    nlp: language,
    searchPlan: mutable.searchPlan ?? null,
    learnedLanguage: {
      used: Boolean(learned),
      phraseKey: learned?.phraseKey ?? null,
      confidence: learned?.confidence ?? null,
      support: learned?.support ?? null,
      source: learned?.source ?? null,
      llmAvoided: Boolean(learned),
      suggestionRecorded: learning.recorded,
      mappingPromoted: learning.promoted,
    },
    conversationRefinement: {
      used: conversation.refinementUsed,
      currentQuery: conversation.currentQuery,
      previousRequestId: conversation.previousRequestId,
      effectiveQuery: conversation.effectiveQuery,
    },
  };
  return mutable as SearchV2Response;
}
