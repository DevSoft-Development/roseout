import type { LanguageRuntimeDiagnostics } from "../languageRuntime";
import type { SearchPlan, VenueRelationshipType } from "./searchPlanTypes";
import { validateSearchPlan } from "./validateSearchPlan";

const uniq = (values: readonly string[]) => [
  ...new Set(values.map((value) => String(value).trim()).filter(Boolean)),
];

function resolvedRelationship(plan: SearchPlan, diagnostics: LanguageRuntimeDiagnostics): VenueRelationshipType {
  const current = plan.relationship?.type ?? "any";
  const clarified = diagnostics.relationship.type;
  if (clarified === "any") return current;
  if (diagnostics.llmUsed && (diagnostics.llmConfidence ?? 0) >= 0.75) return clarified;
  if (current === "any") return clarified;
  return current;
}

function separateStops(type: VenueRelationshipType) {
  return type === "sequential" || type === "proximity" || type === "separate_venues";
}

/**
 * Merges the bounded language-runtime result into the canonical SearchPlan.
 * Deterministic planner facts remain authoritative; the LLM can only clarify
 * relationship/soft preference/avoidance fields that were ambiguous.
 */
export function applyLanguageRuntimeToPlan(
  plan: SearchPlan,
  diagnostics: LanguageRuntimeDiagnostics,
): SearchPlan {
  const relationship = resolvedRelationship(plan, diagnostics);
  const bothDomains = plan.restaurant.required && plan.activity.required;
  const sameVenueRequired = relationship === "same_venue_required";
  const sameVenuePreferred = relationship === "same_venue_preferred";
  const requiresSeparateStops = separateStops(relationship);

  let mode = plan.mode;
  if (plan.mode !== "anchored_nearby" && bothDomains) {
    if (sameVenueRequired) mode = "same_venue";
    else if (requiresSeparateStops) mode = "paired_outing";
  }

  const next: SearchPlan = {
    ...plan,
    mode,
    restaurant: {
      ...plan.restaurant,
      exclusions: uniq([
        ...plan.restaurant.exclusions,
        ...diagnostics.negatives.restaurant,
      ]),
    },
    activity: {
      ...plan.activity,
      exclusions: uniq([
        ...plan.activity.exclusions,
        ...diagnostics.negatives.activity,
      ]),
    },
    relationship: {
      type: relationship,
      evidence: uniq([
        ...(plan.relationship?.evidence ?? []),
        ...diagnostics.relationship.evidence,
        diagnostics.llmUsed ? "language_runtime_llm_checked" : "",
      ]),
    },
    preferences: {
      vibes: uniq([
        ...(plan.preferences?.vibes ?? []),
        ...diagnostics.preferences.vibes,
        ...diagnostics.llmSoftVibes,
      ]),
      avoidVibes: uniq([
        ...(plan.preferences?.avoidVibes ?? []),
        ...diagnostics.negatives.vibes,
        ...diagnostics.llmAvoidTerms,
      ]),
      subjectiveTerms: uniq([
        ...(plan.preferences?.subjectiveTerms ?? []),
        ...diagnostics.preferences.subjectiveTerms,
        ...diagnostics.llmSoftVibes,
      ]),
      budget: diagnostics.preferences.budget ?? plan.preferences?.budget ?? null,
      noise: diagnostics.preferences.noise ?? plan.preferences?.noise ?? null,
    },
    pairing: {
      ...plan.pairing,
      required: bothDomains ? plan.pairing.required || sameVenueRequired || requiresSeparateStops : plan.pairing.required,
      sameVenueRequired: bothDomains ? sameVenueRequired || (!requiresSeparateStops && plan.pairing.sameVenueRequired) : plan.pairing.sameVenueRequired,
      sameVenuePreferred: bothDomains
        ? sameVenueRequired || sameVenuePreferred || (!requiresSeparateStops && plan.pairing.sameVenuePreferred)
        : plan.pairing.sameVenuePreferred,
    },
    fallback: {
      ...plan.fallback,
      allowNearbyPair: sameVenueRequired ? false : plan.fallback.allowNearbyPair,
    },
    parser: {
      ...plan.parser,
      source: diagnostics.llmUsed ? "hybrid" : plan.parser.source,
      reasons: uniq([
        ...plan.parser.reasons,
        diagnostics.llmUsed ? `ambiguity checked by ${diagnostics.llmModel ?? "llm"}` : "",
        diagnostics.ambiguityReasons.length
          ? `ambiguity signals: ${diagnostics.ambiguityReasons.join(",")}`
          : "",
      ]),
      llmUsed: diagnostics.llmUsed,
      llmModel: diagnostics.llmModel,
      ambiguityReasons: diagnostics.ambiguityReasons,
    },
  };

  validateSearchPlan(next);
  return next;
}
