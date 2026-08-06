import { haversineMiles } from "../../enterprise/distance";
import { geoTierRank, pairGeoTier } from "../geo/geoPolicy";
import type { PairingDebugTrace, PairingRejectionReason, SearchTrace } from "../observability/searchTrace";
import type { SearchPlan } from "../planner/searchPlanTypes";
import type { ScoredCandidate } from "../scoring/scoringTypes";
import type { SearchPair } from "./pairingTypes";
import { validatePairDistance } from "./validatePairDistance";

const MAX_REJECTED_PAIR_SAMPLES = 200;
const TARGET_PAIR_COUNT = 20;
const INITIAL_LANE_LIMIT = 20;
const MAX_ADAPTIVE_LANE_LIMIT = 40;
const MIN_VALID_FRONTIER = 32;

function locationOf(candidate: ScoredCandidate) { return candidate.candidate.candidate.location as any; }
function retrievedOf(candidate: ScoredCandidate) { return candidate.candidate.candidate; }
function diversifyPairs(pairs: SearchPair[], limit = TARGET_PAIR_COUNT, maxPerRestaurant = 2, maxPerActivity = 2) {
  const restaurantUses = new Map<string, number>();
  const activityUses = new Map<string, number>();
  const selected: SearchPair[] = [];
  for (const pair of pairs) {
    const restaurantId = String(pair.restaurant.candidate.candidate.location.id);
    const activityId = String(pair.activity.candidate.candidate.location.id);
    if ((restaurantUses.get(restaurantId) ?? 0) >= maxPerRestaurant) continue;
    if ((activityUses.get(activityId) ?? 0) >= maxPerActivity) continue;
    selected.push(pair);
    restaurantUses.set(restaurantId, (restaurantUses.get(restaurantId) ?? 0) + 1);
    activityUses.set(activityId, (activityUses.get(activityId) ?? 0) + 1);
    if (selected.length >= limit) break;
  }
  return selected;
}
function emptyRejectionCounts(): PairingDebugTrace["rejectionCounts"] {
  return { distance_exceeded: 0, missing_coordinates: 0, market_mismatch: 0, walkability_constraint: 0, schedule_open_hours_conflict: 0, same_venue_constraint: 0, insufficient_domain_candidates: 0, other: 0 };
}
function tierReason(tier: SearchPair["geoTier"]) {
  return tier === "exact_locality" ? "both venues match the requested locality" : tier === "nearby_radius" ? "nearby options outside the exact locality" : "broader geographic fallback options";
}
function pairTrace(pair: SearchPair): PairingDebugTrace["finalEligiblePairs"][number] {
  return { restaurantId: String(pair.restaurant.candidate.candidate.location.id), activityId: String(pair.activity.candidate.candidate.location.id), distanceMiles: pair.distanceMiles, walkingMinutes: pair.walkingMinutes, geoTier: pair.geoTier ?? "exact_locality" };
}
export function explicitDistanceRequested(plan: SearchPlan) {
  if (plan.pairing.requireWalkable || plan.pairing.maxWalkingMinutes != null || plan.pairing.maxDrivingMinutes != null) return true;
  return /\b(?:within|under|less than|no more than|max(?:imum)?|up to)\s+\d+(?:\.\d+)?(?:\s*[-–—]\s*|\s+)(?:mile|miles|mi|minute|minutes|min)\b|\b\d+(?:\.\d+)?(?:\s*[-–—]\s*|\s+)(?:mile|miles|mi|minute|minutes|min)(?:\s*[-–—]\s*|\s+)(?:away|apart|walk|walking|drive|driving)\b|\bwalking distance\b/i.test(plan.rawQuery);
}

export async function buildPairs({ plan, restaurants, activities, trace }: { plan: SearchPlan; restaurants: ScoredCandidate[]; activities: ScoredCandidate[]; trace?: SearchTrace }): Promise<SearchPair[]> {
  const initialRestaurantLimit = Math.min(INITIAL_LANE_LIMIT, restaurants.length);
  const initialActivityLimit = Math.min(INITIAL_LANE_LIMIT, activities.length);
  const adaptiveRestaurantLimit = Math.min(MAX_ADAPTIVE_LANE_LIMIT, restaurants.length);
  const adaptiveActivityLimit = Math.min(MAX_ADAPTIVE_LANE_LIMIT, activities.length);
  const theoreticalPairCandidates = adaptiveRestaurantLimit * adaptiveActivityLimit;
  const hardDistance = explicitDistanceRequested(plan);
  const pairs: SearchPair[] = [];
  const evaluatedKeys = new Set<string>();
  const debug: PairingDebugTrace = {
    restaurantCandidates: restaurants.length,
    activityCandidates: activities.length,
    theoreticalPairCandidates,
    pairCandidatesEvaluated: 0,
    pairCandidatesSkipped: 0,
    shortCircuitApplied: false,
    shortCircuitReason: null,
    targetPairCount: TARGET_PAIR_COUNT,
    frontierPairCount: 0,
    adaptiveExpansionApplied: false,
    adaptiveRestaurantLimit,
    adaptiveActivityLimit,
    initialRestaurantLimit,
    initialActivityLimit,
    validPairCountBeforeRender: 0,
    validPairCountAfterConstraints: 0,
    validPairCountAfterDiversification: 0,
    renderEligiblePairCount: 0,
    finalEligiblePairs: [],
    eligibilityContractValid: true,
    eligibilityContractViolation: null,
    rejectionCounts: emptyRejectionCounts(),
    rejectedPairs: [],
    nearestRejectedPair: null,
    allCandidatePairsExceededTravelLimit: false,
    primaryFailure: null,
  };
  const meta = new Map<ScoredCandidate, { id: string | null; coords: { lat: number; lng: number } | null; unavailable: boolean; tier: any; ml: number }>();
  const get = (candidate: ScoredCandidate) => {
    const cached = meta.get(candidate);
    if (cached) return cached;
    const location = locationOf(candidate);
    const lat = Number(location.latitude);
    const lng = Number(location.longitude);
    const value = {
      id: location?.id == null ? null : String(location.id),
      coords: Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null,
      unavailable: location?.is_open === false || location?.open_now === false || location?.schedule_match === false || location?.availability_status === "closed" || location?.availability_status === "unavailable",
      tier: retrievedOf(candidate).geoMatch?.tier ?? "outside_scope",
      ml: Math.min(5, Number(location.ml_pair_score ?? 0)),
    };
    meta.set(candidate, value);
    return value;
  };
  const reject = (reason: PairingRejectionReason, restaurant: ScoredCandidate | null, activity: ScoredCandidate | null, detail: string, distanceMiles: number | null = null, walkingMinutes: number | null = null) => {
    debug.rejectionCounts[reason] += 1;
    const row = { restaurantId: restaurant ? get(restaurant).id : null, activityId: activity ? get(activity).id : null, reason, detail, distanceMiles, walkingMinutes };
    if (distanceMiles != null && (!debug.nearestRejectedPair || debug.nearestRejectedPair.distanceMiles == null || distanceMiles < debug.nearestRejectedPair.distanceMiles)) debug.nearestRejectedPair = row;
    if (debug.rejectedPairs.length < MAX_REJECTED_PAIR_SAMPLES) debug.rejectedPairs.push(row);
  };

  if (!restaurants.length || !activities.length) {
    reject("insufficient_domain_candidates", null, null, !restaurants.length && !activities.length ? "restaurant_and_activity_candidates_empty" : !restaurants.length ? "restaurant_candidates_empty" : "activity_candidates_empty");
    debug.primaryFailure = "insufficient_domain_candidates";
    if (trace) {
      trace.pairingDebug = debug;
      trace.counts.pairsBuilt = 0;
      trace.counts.pairsValid = 0;
    }
    return [];
  }

  const bestTierPairs = () => {
    const sorted = [...pairs].sort((a, b) => geoTierRank(a.geoTier) - geoTierRank(b.geoTier) || b.scores.total - a.scores.total);
    const bestRank = sorted.length ? geoTierRank(sorted[0].geoTier) : Number.POSITIVE_INFINITY;
    return sorted.filter((pair) => geoTierRank(pair.geoTier) === bestRank);
  };

  const evaluateFrontier = (restaurantLimit: number, activityLimit: number, phase: "initial" | "adaptive") => {
    const frontier: Array<{ restaurant: ScoredCandidate; activity: ScoredCandidate; key: string; upperBound: number }> = [];
    for (const restaurant of restaurants.slice(0, restaurantLimit)) {
      for (const activity of activities.slice(0, activityLimit)) {
        const key = `${get(restaurant).id ?? "r"}:${get(activity).id ?? "a"}`;
        if (evaluatedKeys.has(key)) continue;
        frontier.push({ restaurant, activity, key, upperBound: (restaurant.scores.total + activity.scores.total) * 0.4 + 25 });
      }
    }
    frontier.sort((a, b) => b.upperBound - a.upperBound);
    debug.frontierPairCount += frontier.length;
    for (let index = 0; index < frontier.length; index += 1) {
      const { restaurant, activity, key } = frontier[index];
      evaluatedKeys.add(key);
      debug.pairCandidatesEvaluated += 1;
      const restaurantMeta = get(restaurant);
      const activityMeta = get(activity);
      const geoTier = pairGeoTier(restaurantMeta.tier, activityMeta.tier);
      if (!geoTier) { reject("market_mismatch", restaurant, activity, `restaurant=${restaurantMeta.tier};activity=${activityMeta.tier}`); continue; }
      if (restaurantMeta.unavailable || activityMeta.unavailable) { reject("schedule_open_hours_conflict", restaurant, activity, `restaurantUnavailable=${restaurantMeta.unavailable};activityUnavailable=${activityMeta.unavailable}`); continue; }
      const sameVenue = restaurantMeta.id === activityMeta.id;
      if (plan.pairing.sameVenueRequired && !sameVenue) { reject("same_venue_constraint", restaurant, activity, "same_venue_required"); continue; }
      const distance = sameVenue ? 0 : restaurantMeta.coords && activityMeta.coords ? haversineMiles(restaurantMeta.coords.lat, restaurantMeta.coords.lng, activityMeta.coords.lat, activityMeta.coords.lng) : null;
      const walking = distance == null ? null : Math.ceil(distance * 20);
      if (!sameVenue && distance == null && hardDistance) { reject("missing_coordinates", restaurant, activity, "hard_distance_requires_coordinates"); continue; }
      if (hardDistance && !validatePairDistance(plan, distance, walking)) {
        const walkingConstraint = plan.pairing.requireWalkable || plan.pairing.maxWalkingMinutes != null;
        reject(walkingConstraint ? "walkability_constraint" : "distance_exceeded", restaurant, activity, walkingConstraint ? "requested_walking_limit_exceeded" : "requested_distance_limit_exceeded", distance, walking);
        continue;
      }
      const tierRank = geoTierRank(geoTier);
      const distanceScore = distance == null ? 40 : Math.max(0, 100 - distance * 12);
      const mlPairBoost = Math.max(restaurantMeta.ml, activityMeta.ml);
      const total = (restaurant.scores.total + activity.scores.total) * 0.4 + distanceScore * 0.2 + mlPairBoost - tierRank * 12;
      pairs.push({ restaurant, activity, distanceMiles: distance, walkingMinutes: walking, walkingMinutesSource: walking == null ? "unavailable" : "estimated", geoTier, isFallbackPair: geoTier !== "exact_locality", scores: { restaurant: restaurant.scores.total, activity: activity.scores.total, distance: distanceScore, combinedQuality: (restaurant.scores.quality + activity.scores.quality) / 2, sequence: 100, mlPairBoost, total }, reasons: [sameVenue ? "both roles at one venue" : tierReason(geoTier), walking == null ? "walking time unavailable" : `about ${walking} minutes walking`] });
      if (pairs.length >= MIN_VALID_FRONTIER) {
        const diversified = diversifyPairs(bestTierPairs());
        const next = frontier[index + 1];
        const floor = diversified.length >= TARGET_PAIR_COUNT ? diversified[diversified.length - 1].scores.total : Number.NEGATIVE_INFINITY;
        if (diversified.length >= TARGET_PAIR_COUNT && (!next || next.upperBound <= floor)) {
          debug.shortCircuitApplied = true;
          debug.shortCircuitReason = phase === "initial" ? "initial_quality_frontier_satisfied" : "adaptive_quality_frontier_satisfied";
          break;
        }
      }
    }
  };

  evaluateFrontier(initialRestaurantLimit, initialActivityLimit, "initial");
  const initialDiversified = diversifyPairs(bestTierPairs());
  const canExpand = adaptiveRestaurantLimit > initialRestaurantLimit || adaptiveActivityLimit > initialActivityLimit;
  if (initialDiversified.length < TARGET_PAIR_COUNT && canExpand) {
    debug.adaptiveExpansionApplied = true;
    evaluateFrontier(adaptiveRestaurantLimit, adaptiveActivityLimit, "adaptive");
  }

  debug.pairCandidatesSkipped = Math.max(0, theoreticalPairCandidates - debug.pairCandidatesEvaluated);
  debug.validPairCountBeforeRender = pairs.length;
  debug.validPairCountAfterConstraints = pairs.length;
  const diversified = diversifyPairs(bestTierPairs());
  debug.validPairCountAfterDiversification = diversified.length;
  debug.renderEligiblePairCount = diversified.length;
  debug.finalEligiblePairs = diversified.map(pairTrace);
  debug.eligibilityContractValid = debug.renderEligiblePairCount === debug.finalEligiblePairs.length;
  debug.eligibilityContractViolation = debug.eligibilityContractValid ? null : `renderEligiblePairCount=${debug.renderEligiblePairCount};finalEligiblePairs=${debug.finalEligiblePairs.length}`;
  const travelRejections = debug.rejectionCounts.walkability_constraint + debug.rejectionCounts.distance_exceeded;
  debug.allCandidatePairsExceededTravelLimit = hardDistance && debug.pairCandidatesEvaluated > 0 && diversified.length === 0 && travelRejections === debug.pairCandidatesEvaluated;
  debug.primaryFailure = debug.pairCandidatesEvaluated === 0 ? "no_pair_candidates" : debug.allCandidatePairsExceededTravelLimit ? "travel_constraint_exceeded" : debug.rejectionCounts.market_mismatch >= debug.pairCandidatesEvaluated ? "market_mismatch" : debug.rejectionCounts.walkability_constraint >= debug.pairCandidatesEvaluated ? "walkability_constraint" : debug.rejectionCounts.distance_exceeded >= debug.pairCandidatesEvaluated ? "distance_exceeded" : debug.rejectionCounts.missing_coordinates >= debug.pairCandidatesEvaluated ? "missing_coordinates" : debug.rejectionCounts.schedule_open_hours_conflict >= debug.pairCandidatesEvaluated ? "schedule_open_hours_conflict" : diversified.length === 0 ? "no_valid_pairs" : null;
  if (trace) {
    trace.pairingDebug = debug;
    trace.counts.pairsBuilt = pairs.length;
    trace.counts.pairsValid = diversified.length;
    trace.decisions.push({ stage: "pairing_performance", decision: debug.adaptiveExpansionApplied ? "adaptive_frontier_expanded" : debug.shortCircuitApplied ? "short_circuit_applied" : "initial_frontier_complete", reason: JSON.stringify({ theoreticalPairCandidates, pairCandidatesEvaluated: debug.pairCandidatesEvaluated, pairCandidatesSkipped: debug.pairCandidatesSkipped, shortCircuitReason: debug.shortCircuitReason, adaptiveExpansionApplied: debug.adaptiveExpansionApplied, initialRestaurantLimit, initialActivityLimit, adaptiveRestaurantLimit, adaptiveActivityLimit }) });
    trace.decisions.push({ stage: "pairing_eligibility", decision: debug.eligibilityContractValid ? (diversified.length ? "pairs_available" : "pairs_unavailable") : "pairing_contract_violation", reason: JSON.stringify({ ...debug, servedGeoTier: diversified[0]?.geoTier ?? null }) });
  }
  return diversified;
}
