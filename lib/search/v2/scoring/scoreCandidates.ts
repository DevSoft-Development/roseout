import type { SearchPlan } from "../planner/searchPlanTypes";
import type { RoleQualifiedCandidate } from "../roles/roleTypes";
import type { SearchTrace } from "../observability/searchTrace";
import { activityRetrievalTerms } from "../taxonomy";
import { applyMlBoost } from "./applyMlBoost";
import type { ScoredCandidate } from "./scoringTypes";
import { isFamilyUnsafeActivity } from "../roles/domainIdentity";
import { geoTierRank } from "../geo/geoPolicy";

const clamp = (n: number) => Math.max(0, Math.min(100, n));
const searchableText = (location: Record<string, unknown>) => [location.name,location.restaurant_name,location.activity_name,location.primary_category,location.cuisine,location.cuisine_type,location.activity_type,location.tags,location.vibe_tags,location.best_for_tags,location.date_style_tags,location.semantic_tags,location.intent_tags,location.search_keywords,location.search_document,location.semantic_search_text,location.description,location.price_level,location.price_range,location.restaurant_categories,location.cuisines,location.foods,location.activity_categories,location.nightlife_categories,location.meal_periods,location.features].flatMap((value) => Array.isArray(value) ? value : [value]).filter(Boolean).join(" ").toLowerCase();

function matchesCanonicalOrRaw(term: string, text: string, canonicalTerms: Set<string>) {
  if (text.includes(term) || canonicalTerms.has(term)) return true;
  for (const canonicalTerm of canonicalTerms) {
    if (canonicalTerm.includes(term) || term.includes(canonicalTerm)) return true;
  }
  return false;
}

function compareByGeoTierThenScore(a: ScoredCandidate, b: ScoredCandidate) {
  const aTier = a.candidate.candidate.geoMatch?.tier;
  const bTier = b.candidate.candidate.geoMatch?.tier;
  return geoTierRank(aTier) - geoTierRank(bTier) || b.scores.total - a.scores.total;
}

export async function scoreCandidates({ plan, candidates, trace }: { plan: SearchPlan; candidates: RoleQualifiedCandidate[]; trace?: SearchTrace }) {
  const mlEnabled = !["0", "false", "off"].includes(String(process.env.ML_ENABLED ?? "true").toLowerCase());
  const requestedRestaurantTerms = [...plan.restaurant.cuisines, ...plan.restaurant.foods].map((term) => term.toLowerCase());
  const requestedActivityTerms = plan.activity.categories.flatMap((category) => activityRetrievalTerms(category)).map((term) => term.toLowerCase());
  const casualRequested = plan.restaurant.features.includes("casual");
  const relaxedRequested = plan.activity.categories.includes("relaxed_activity");
  const dinnerRequested = plan.restaurant.mealPeriods.includes("dinner");
  let familySafetyRejected = 0;
  let dinnerRejected = 0;
  let weakActivityRejected = 0;

  const scored = candidates.map((candidate): ScoredCandidate | null => {
    const role = [...candidate.roles].sort((a, b) => b.confidence - a.confidence)[0];
    const l = candidate.candidate.location;
    const isRestaurant = role.role === "restaurant" || role.role.endsWith("_restaurant");
    const isActivity = role.role === "general_activity" || role.role.endsWith("_activity");
    if (plan.audience.minorsPresent && isActivity && isFamilyUnsafeActivity(l)) {
      familySafetyRejected++;
      return null;
    }
    const specialized = role.role !== "restaurant" && role.role !== "general_activity";
    const text = searchableText(l as Record<string, unknown>);
    const canonicalTerms = new Set(candidate.candidate.retrievalSources.includes("enterprise_search_profile_locations")
      ? candidate.candidate.matchedRetrievalTerms.map((term) => term.toLowerCase())
      : []);
    const explicitRestaurantMatches = requestedRestaurantTerms.filter((term) => matchesCanonicalOrRaw(term, text, canonicalTerms)).length;
    const explicitActivityMatches = requestedActivityTerms.filter((term) => matchesCanonicalOrRaw(term, text, canonicalTerms)).length;
    const highEnergyActivity = /nightlife|nightclub|club|dance floor|loud|party|bowling|arcade|sports bar|hookah/i.test(`${text} ${[...canonicalTerms].join(" ")}`);
    const fineDiningRestaurant = /fine[_ -]?dining|tasting menu|michelin|prix fixe|white tablecloth|luxury dining/i.test(text);
    const casualRestaurant = /casual|laid-back|low-key|neighborhood|family style|counter service|cafe|bistro|taqueria|diner|gastropub|brunch/i.test(text);
    const coffeeFirstVenue = /coffee shop|coffeehouse|\bcafe\b|\bcafé\b|bakery|tea house|dessert shop|juice bar/i.test(text);
    const dinnerEvidence = /\bdinner\b|full[- ]service|table service|entree|entrée|steak|seafood|pasta|supper|evening dining|dinner menu|prix fixe|tasting menu|meal_periods?.{0,20}dinner/i.test(`${text} ${[...canonicalTerms].join(" ")}`);
    const intent = clamp(requestedRestaurantTerms.length && isRestaurant ? explicitRestaurantMatches ? 100 : 25 : requestedActivityTerms.length && isActivity ? explicitActivityMatches ? 100 : relaxedRequested && !highEnergyActivity ? 82 : 30 : specialized ? 95 : 75);
    const roleConfidence = role.confidence * 100;
    const distance = candidate.candidate.distanceMiles;
    const geo = distance == null ? 60 : clamp(100 - distance / Math.max(1, plan.geo.radiusMiles) * 100);
    const rating = Number(l.rating ?? 0);
    const quality = clamp(Number(l.quality_score ?? l.theouthaven_score ?? rating * 20));
    const popularity = clamp(Number(l.popularity_score ?? Math.log1p(Number(l.review_count ?? 0)) * 12));
    const requestedFeatures = [...plan.restaurant.features, ...plan.activity.features];
    const directFeatureMatches = requestedFeatures.filter((featureName) => matchesCanonicalOrRaw(featureName.toLowerCase(), text, canonicalTerms)).length;
    const feature = requestedFeatures.length ? clamp((directFeatureMatches + (casualRequested && isRestaurant && casualRestaurant ? 1 : 0)) * 50) : 100;
    const audience = 100;
    const ml = applyMlBoost(l, mlEnabled);
    const missingExplicitRestaurantIntentPenalty = requestedRestaurantTerms.length && isRestaurant && !explicitRestaurantMatches ? 35 : 0;
    const relaxedMismatchPenalty = relaxedRequested && isActivity && (highEnergyActivity || !explicitActivityMatches) ? highEnergyActivity ? 55 : 22 : 0;
    const casualMismatchPenalty = casualRequested && isRestaurant && fineDiningRestaurant && !casualRestaurant ? 35 : 0;
    const dinnerMismatchPenalty = dinnerRequested && isRestaurant && coffeeFirstVenue && !dinnerEvidence ? 32 : 0;
    if (dinnerMismatchPenalty) dinnerRejected++;
    if (requestedActivityTerms.length && isActivity && !explicitActivityMatches) weakActivityRejected++;
    const penalties = missingExplicitRestaurantIntentPenalty + relaxedMismatchPenalty + casualMismatchPenalty + dinnerMismatchPenalty;
    const base = intent * .35 + roleConfidence * .2 + geo * .2 + quality * .1 + feature * .08 + popularity * .05 + audience * .02;
    const total = clamp(base + ml.boost - penalties);
    const matchedRestaurantTerms = requestedRestaurantTerms.filter((term) => matchesCanonicalOrRaw(term, text, canonicalTerms));
    const matchedActivityTerms = requestedActivityTerms.filter((term) => matchesCanonicalOrRaw(term, text, canonicalTerms));
    const reasons = [`qualified as ${role.role}`,explicitRestaurantMatches ? `matched requested restaurant terms: ${matchedRestaurantTerms.join(", ")}` : requestedRestaurantTerms.length && isRestaurant ? "missing explicit restaurant term" : null,explicitActivityMatches ? `matched requested activity terms: ${matchedActivityTerms.slice(0, 3).join(", ")}` : requestedActivityTerms.length && isActivity ? "weak activity-intent match" : null,canonicalTerms.size ? "canonical profile evidence preserved in scoring" : null,casualRequested && isRestaurant ? casualRestaurant ? "matched casual dining intent" : fineDiningRestaurant ? "penalized as formal/fine dining" : "casual dining evidence unavailable" : null,relaxedRequested && isActivity ? highEnergyActivity ? "penalized as high-energy activity" : "matched relaxed activity intent" : null,dinnerMismatchPenalty ? "penalized as coffee-first venue for dinner" : dinnerRequested && isRestaurant && dinnerEvidence ? "matched verified dinner evidence" : dinnerRequested && isRestaurant ? "dinner evidence unavailable" : null,distance == null ? "distance unavailable" : `${distance.toFixed(1)} miles away`,ml.boost ? "bounded ML ranking boost applied" : "deterministic ranking"].filter(Boolean) as string[];
    return { candidate, selectedRole: role.role, scores: { intentMatch: intent, roleConfidence, geoFit: geo, quality, featureMatch: feature, popularity, audienceFit: audience, mlBoost: ml.boost, penalties, total }, reasons, ml: { enabled: mlEnabled, modelVersion: ml.modelVersion, phase1Score: ml.score, phase1Boost: ml.boost, phase2Score: typeof l.intent_score === "number" ? l.intent_score : null, phase2Boost: Math.min(5, Number(l.intent_boost ?? 0)), pairScore: null, pairBoost: 0, baseRank: null, finalRank: null, rankDelta: null } };
  }).filter((item): item is ScoredCandidate => Boolean(item)).sort(compareByGeoTierThenScore);

  scored.forEach((item, index) => { item.ml.baseRank = index + 1; item.ml.finalRank = index + 1; item.ml.rankDelta = 0; });
  if (trace) {
    trace.ml.enabled = mlEnabled;
    trace.ml.phase1Enabled = mlEnabled;
    trace.ml.phase2Enabled = mlEnabled;
    trace.ml.modelVersion = scored.find((item) => item.ml.modelVersion)?.ml.modelVersion ?? null;
    trace.ml.rankingVariant = mlEnabled ? "hybrid" : "deterministic";
    trace.rejections.familySafety = familySafetyRejected;
    trace.rejections.dinnerEvidence = dinnerRejected;
    trace.rejections.weakActivityIntent = weakActivityRejected;
  }
  const restaurants = scored.filter((item) => item.selectedRole === "restaurant" || item.selectedRole.endsWith("_restaurant"));
  const activities = scored.filter((item) => item.selectedRole === "general_activity" || item.selectedRole.endsWith("_activity"));
  const explicitRestaurantMatches = restaurants.filter((item) => !requestedRestaurantTerms.length || item.scores.penalties < 35);
  const relaxedActivityMatches = activities.filter((item) => !relaxedRequested || item.scores.penalties < 55);
  const dinnerSuitableRestaurants = restaurants.filter((item) => !dinnerRequested || item.scores.penalties < 32);
  return {
    all: scored,
    restaurants: requestedRestaurantTerms.length && explicitRestaurantMatches.length
      ? explicitRestaurantMatches
      : dinnerRequested && dinnerSuitableRestaurants.length
        ? dinnerSuitableRestaurants
        : restaurants,
    activities: relaxedRequested && relaxedActivityMatches.length ? relaxedActivityMatches : activities,
  };
}