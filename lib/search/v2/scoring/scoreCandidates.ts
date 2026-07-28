import type { SearchPlan } from "../planner/searchPlanTypes";
import type { RoleQualifiedCandidate } from "../roles/roleTypes";
import type { SearchTrace } from "../observability/searchTrace";
import { applyMlBoost } from "./applyMlBoost";
import type { ScoredCandidate } from "./scoringTypes";

const clamp = (n: number) => Math.max(0, Math.min(100, n));
const searchableText = (location: Record<string, unknown>) =>
  [
    location.name,
    location.restaurant_name,
    location.activity_name,
    location.primary_category,
    location.cuisine,
    location.cuisine_type,
    location.activity_type,
    location.tags,
    location.semantic_tags,
    location.intent_tags,
    location.search_keywords,
    location.search_document,
    location.semantic_search_text,
    location.description,
  ]
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

export async function scoreCandidates({ plan, candidates, trace }: { plan: SearchPlan; candidates: RoleQualifiedCandidate[]; trace?: SearchTrace }) {
  const mlEnabled = !["0", "false", "off"].includes(String(process.env.ML_ENABLED ?? "true").toLowerCase());
  const requestedRestaurantTerms = [...plan.restaurant.cuisines, ...plan.restaurant.foods].map((term) => term.toLowerCase());
  const scored = candidates.map((candidate): ScoredCandidate => {
    const role = candidate.roles.sort((a, b) => b.confidence - a.confidence)[0];
    const l = candidate.candidate.location;
    const specialized = role.role !== "restaurant" && role.role !== "general_activity";
    const text = searchableText(l as Record<string, unknown>);
    const explicitRestaurantMatches = requestedRestaurantTerms.filter((term) => text.includes(term)).length;
    const intent = clamp(requestedRestaurantTerms.length && (role.role === "restaurant" || role.role.endsWith("_restaurant")) ? (explicitRestaurantMatches ? 100 : 25) : specialized ? 95 : 75);
    const roleConfidence = role.confidence * 100;
    const distance = candidate.candidate.distanceMiles;
    const geo = distance == null ? 60 : clamp(100 - distance / Math.max(1, plan.geo.radiusMiles) * 100);
    const rating = Number(l.rating ?? 0);
    const quality = clamp(Number(l.quality_score ?? l.theouthaven_score ?? rating * 20));
    const popularity = clamp(Number(l.popularity_score ?? Math.log1p(Number(l.review_count ?? 0)) * 12));
    const requestedFeatures = [...plan.restaurant.features, ...plan.activity.features];
    const feature = requestedFeatures.length ? clamp(requestedFeatures.filter((featureName) => text.includes(featureName.toLowerCase())).length * 50) : 100;
    const audience = plan.audience.minorsPresent && /adult|21\+|nightclub/i.test(JSON.stringify(l)) ? 0 : 100;
    const ml = applyMlBoost(l, mlEnabled);
    const missingExplicitRestaurantIntentPenalty = requestedRestaurantTerms.length && (role.role === "restaurant" || role.role.endsWith("_restaurant")) && !explicitRestaurantMatches ? 35 : 0;
    const base = intent * .35 + roleConfidence * .2 + geo * .2 + quality * .1 + feature * .08 + popularity * .05 + audience * .02;
    const total = clamp(base + ml.boost - missingExplicitRestaurantIntentPenalty);
    return { candidate, selectedRole: role.role, scores: { intentMatch: intent, roleConfidence, geoFit: geo, quality, featureMatch: feature, popularity, audienceFit: audience, mlBoost: ml.boost, penalties: missingExplicitRestaurantIntentPenalty, total }, reasons: [`qualified as ${role.role}`, explicitRestaurantMatches ? `matched requested restaurant terms: ${requestedRestaurantTerms.filter((term) => text.includes(term)).join(", ")}` : requestedRestaurantTerms.length ? "missing explicit restaurant term" : "no explicit restaurant term required", distance == null ? "distance unavailable" : `${distance.toFixed(1)} miles away`, ml.boost ? "bounded ML ranking boost applied" : "deterministic ranking"], ml: { enabled: mlEnabled, modelVersion: ml.modelVersion, phase1Score: ml.score, phase1Boost: ml.boost, phase2Score: typeof l.intent_score === "number" ? l.intent_score : null, phase2Boost: Math.min(5, Number(l.intent_boost ?? 0)), pairScore: null, pairBoost: 0, baseRank: null, finalRank: null, rankDelta: null } };
  }).sort((a, b) => b.scores.total - a.scores.total);

  scored.forEach((item, index) => { item.ml.baseRank = index + 1; item.ml.finalRank = index + 1; item.ml.rankDelta = 0; });
  if (trace) { trace.ml.enabled = mlEnabled; trace.ml.phase1Enabled = mlEnabled; trace.ml.phase2Enabled = mlEnabled; trace.ml.modelVersion = scored.find((item) => item.ml.modelVersion)?.ml.modelVersion ?? null; trace.ml.rankingVariant = mlEnabled ? "hybrid" : "deterministic"; }

  const restaurants = scored.filter((item) => item.selectedRole === "restaurant" || item.selectedRole.endsWith("_restaurant"));
  const activities = scored.filter((item) => item.selectedRole.endsWith("_activity"));
  const explicitRestaurantMatches = restaurants.filter((item) => item.scores.penalties === 0);
  return { all: scored, restaurants: requestedRestaurantTerms.length && explicitRestaurantMatches.length ? explicitRestaurantMatches : restaurants, activities };
}
