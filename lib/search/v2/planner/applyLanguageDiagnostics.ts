import type { LanguageRuntimeDiagnostics } from "../languageRuntime";
import type { SearchPlan } from "./searchPlanTypes";
import { validateSearchPlan } from "./validateSearchPlan";

const uniq = (items: readonly string[]) => [
  ...new Set(items.map((item) => String(item).trim()).filter(Boolean)),
];

function relationshipRequiresSeparateStops(type: LanguageRuntimeDiagnostics["relationship"]["type"]) {
  return type === "sequential" || type === "proximity" || type === "separate_venues";
}

export function applyLanguageDiagnosticsToPlan(
  plan: SearchPlan,
  diagnostics: LanguageRuntimeDiagnostics,
  originalQuery: string,
): SearchPlan {
  const relationshipType = diagnostics.relationship.type;
  const bothDomains = Boolean(plan.restaurant.required && plan.activity.required);
  const hardSameVenue = relationshipType === "same_venue_required";
  const preferredSameVenue = relationshipType === "same_venue_preferred";
  const separateStops = relationshipRequiresSeparateStops(relationshipType);

  let mode = plan.mode;
  if (plan.mode !== "anchored_nearby" && bothDomains) {
    if (hardSameVenue) mode = "same_venue";
    else if (separateStops) mode = "paired_outing";
  }

  const restaurantExclusions = uniq([
    ...plan.restaurant.exclusions,
    ...diagnostics.negatives.restaurant,
  ]);
  const activityExclusions = uniq([
    ...plan.activity.exclusions,
    ...diagnostics.negatives.activity,
  ]);
  const geoExclusions = uniq([
    ...(plan.geo.exclusions ?? []),
    ...diagnostics.negatives.geo,
  ]);
  const vibes = uniq([
    ...(plan.preferences?.vibes ?? []),
    ...diagnostics.preferences.vibes,
  ]);
  const avoidVibes = uniq([
    ...(plan.preferences?.avoidVibes ?? []),
    ...diagnostics.negatives.vibes,
  ]);
  const subjectiveTerms = uniq([
    ...(plan.preferences?.subjectiveTerms ?? []),
    ...diagnostics.preferences.subjectiveTerms,
  ]);

  const reasons = uniq([
    ...plan.parser.reasons,
    `language relationship: ${relationshipType}`,
    diagnostics.relationship.evidence.length
      ? `relationship evidence: ${diagnostics.relationship.evidence.join(",")}`
      : "",
    restaurantExclusions.length
      ? `restaurant exclusions: ${restaurantExclusions.join(",")}`
      : "",
    activityExclusions.length
      ? `activity exclusions: ${activityExclusions.join(",")}`
      : "",
    geoExclusions.length ? `geo exclusions: ${geoExclusions.join(",")}` : "",
    vibes.length ? `soft vibes: ${vibes.join(",")}` : "",
    avoidVibes.length ? `avoid vibes: ${avoidVibes.join(",")}` : "",
    diagnostics.llmUsed
      ? `llm disambiguation: ${diagnostics.llmModel ?? "unknown"}`
      : "",
  ]);

  const next: SearchPlan = {
    ...plan,
    rawQuery: originalQuery,
    mode,
    restaurant: {
      ...plan.restaurant,
      exclusions: restaurantExclusions,
    },
    activity: {
      ...plan.activity,
      exclusions: activityExclusions,
    },
    geo: {
      ...plan.geo,
      exclusions: geoExclusions,
    },
    relationship: {
      type: relationshipType,
      evidence: uniq(diagnostics.relationship.evidence),
    },
    preferences: {
      vibes,
      avoidVibes,
      subjectiveTerms,
      budget: diagnostics.preferences.budget ?? plan.preferences?.budget ?? null,
      noise: diagnostics.preferences.noise ?? plan.preferences?.noise ?? null,
    },
    pairing: {
      ...plan.pairing,
      required: bothDomains ? hardSameVenue || separateStops || plan.pairing.required : plan.pairing.required,
      sameVenuePreferred: hardSameVenue || preferredSameVenue || (!separateStops && plan.pairing.sameVenuePreferred),
      sameVenueRequired: hardSameVenue || (!separateStops && plan.pairing.sameVenueRequired),
    },
    fallback: {
      ...plan.fallback,
      allowNearbyPair: hardSameVenue ? false : plan.fallback.allowNearbyPair,
    },
    parser: {
      ...plan.parser,
      source: diagnostics.llmUsed ? "hybrid" : plan.parser.source,
      reasons,
      llmUsed: diagnostics.llmUsed,
      llmModel: diagnostics.llmModel,
      ambiguityReasons: diagnostics.ambiguityReasons,
    },
  };

  validateSearchPlan(next);
  return next;
}
