import { haversineMiles } from "../../enterprise/distance";
import { geoTierRank, pairGeoTier } from "../geo/geoPolicy";
import type { PairingDebugTrace, PairingRejectionReason, SearchTrace } from "../observability/searchTrace";
import type { SearchPlan } from "../planner/searchPlanTypes";
import type { ScoredCandidate } from "../scoring/scoringTypes";
import type { SearchPair } from "./pairingTypes";
import { validatePairDistance } from "./validatePairDistance";

const MAX_REJECTED_PAIR_SAMPLES = 200;

function locationOf(candidate: ScoredCandidate) {
  return candidate.candidate.candidate.location as any;
}

function retrievedOf(candidate: ScoredCandidate) {
  return candidate.candidate.candidate;
}

function candidateId(candidate: ScoredCandidate) {
  const value = locationOf(candidate)?.id;
  return value == null ? null : String(value);
}

function coords(candidate: ScoredCandidate) {
  const location = locationOf(candidate);
  const lat = Number(location.latitude);
  const lng = Number(location.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function isScheduleUnavailable(candidate: ScoredCandidate) {
  const location = locationOf(candidate);
  return location?.is_open === false
    || location?.open_now === false
    || location?.schedule_match === false
    || location?.availability_status === "closed"
    || location?.availability_status === "unavailable";
}

export function explicitDistanceRequested(plan: SearchPlan) {
  if (plan.pairing.requireWalkable || plan.pairing.maxWalkingMinutes != null) return true;
  const rawFallback = /\b(?:within|under|less than|no more than|max(?:imum)?|up to)\s+\d+(?:\.\d+)?(?:\s*[-–—]\s*|\s+)(?:mile|miles|mi|minute|minutes|min)\b|\b\d+(?:\.\d+)?(?:\s*[-–—]\s*|\s+)(?:mile|miles|mi|minute|minutes|min)(?:\s*[-–—]\s*|\s+)(?:away|apart|walk|walking)\b|\bwalking distance\b/i;
  return rawFallback.test(plan.rawQuery);
}

function diversifyPairs(pairs: SearchPair[], limit = 20, maxPerRestaurant = 2, maxPerActivity = 2) {
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

function recordRejection(debug: PairingDebugTrace, reason: PairingRejectionReason, restaurant: ScoredCandidate | null, activity: ScoredCandidate | null, detail: string, distanceMiles: number | null = null, walkingMinutes: number | null = null) {
  debug.rejectionCounts[reason] += 1;
  if (debug.rejectedPairs.length >= MAX_REJECTED_PAIR_SAMPLES) return;
  debug.rejectedPairs.push({ restaurantId: restaurant ? candidateId(restaurant) : null, activityId: activity ? candidateId(activity) : null, reason, detail, distanceMiles, walkingMinutes });
}

function tierReason(tier: SearchPair["geoTier"]) {
  return tier === "exact_locality"
    ? "both venues match the requested locality"
    : tier === "nearby_radius"
      ? "nearby options outside the exact locality"
      : "broader geographic fallback options";
}

export async function buildPairs({ plan, restaurants, activities, trace }: { plan: SearchPlan; restaurants: ScoredCandidate[]; activities: ScoredCandidate[]; trace?: SearchTrace }): Promise<SearchPair[]> {
  const pairs: SearchPair[] = [];
  const hardDistance = explicitDistanceRequested(plan);
  const debug: PairingDebugTrace = { restaurantCandidates: restaurants.length, activityCandidates: activities.length, pairCandidatesEvaluated: 0, validPairCountBeforeRender: 0, validPairCountAfterDiversification: 0, rejectionCounts: emptyRejectionCounts(), rejectedPairs: [], primaryFailure: null };

  if (!restaurants.length || !activities.length) {
    recordRejection(debug, "insufficient_domain_candidates", null, null, !restaurants.length && !activities.length ? "restaurant_and_activity_candidates_empty" : !restaurants.length ? "restaurant_candidates_empty" : "activity_candidates_empty");
  }

  for (const restaurant of restaurants.slice(0, 20)) {
    for (const activity of activities.slice(0, 20)) {
      debug.pairCandidatesEvaluated += 1;
      const restaurantTier = retrievedOf(restaurant).geoMatch?.tier ?? "outside_scope";
      const activityTier = retrievedOf(activity).geoMatch?.tier ?? "outside_scope";
      const geoTier = pairGeoTier(restaurantTier, activityTier);
      if (!geoTier) {
        recordRejection(debug, "market_mismatch", restaurant, activity, `restaurant=${restaurantTier};activity=${activityTier}`);
        continue;
      }

      if (isScheduleUnavailable(restaurant) || isScheduleUnavailable(activity)) {
        recordRejection(debug, "schedule_open_hours_conflict", restaurant, activity, `restaurantUnavailable=${isScheduleUnavailable(restaurant)};activityUnavailable=${isScheduleUnavailable(activity)}`);
        continue;
      }

      const restaurantCoords = coords(restaurant);
      const activityCoords = coords(activity);
      const sameVenue = candidateId(restaurant) === candidateId(activity);
      if (plan.pairing.sameVenueRequired && !sameVenue) {
        recordRejection(debug, "same_venue_constraint", restaurant, activity, "same_venue_required");
        continue;
      }

      const distance = sameVenue ? 0 : restaurantCoords && activityCoords ? haversineMiles(restaurantCoords.lat, restaurantCoords.lng, activityCoords.lat, activityCoords.lng) : null;
      const walking = distance == null ? null : Math.ceil(distance * 20);
      if (!sameVenue && distance == null && hardDistance) {
        recordRejection(debug, "missing_coordinates", restaurant, activity, "hard_distance_requires_coordinates");
        continue;
      }
      if (hardDistance && !validatePairDistance(plan, distance, walking)) {
        const walkingConstraint = plan.pairing.requireWalkable || plan.pairing.maxWalkingMinutes != null;
        recordRejection(debug, walkingConstraint ? "walkability_constraint" : "distance_exceeded", restaurant, activity, walkingConstraint ? "requested_walking_limit_exceeded" : "requested_distance_limit_exceeded", distance, walking);
        continue;
      }

      const distanceScore = distance == null ? 40 : Math.max(0, 100 - distance * 12);
      const geoPenalty = geoTierRank(geoTier) * 12;
      const mlPairBoost = Math.min(5, Number(locationOf(restaurant).ml_pair_score ?? locationOf(activity).ml_pair_score ?? 0));
      const total = (restaurant.scores.total + activity.scores.total) * 0.4 + distanceScore * 0.2 + mlPairBoost - geoPenalty;
      pairs.push({
        restaurant,
        activity,
        distanceMiles: distance,
        walkingMinutes: walking,
        walkingMinutesSource: walking == null ? "unavailable" : "estimated",
        geoTier,
        isFallbackPair: geoTier !== "exact_locality",
        scores: { restaurant: restaurant.scores.total, activity: activity.scores.total, distance: distanceScore, combinedQuality: (restaurant.scores.quality + activity.scores.quality) / 2, sequence: 100, mlPairBoost, total },
        reasons: [sameVenue ? "both roles at one venue" : tierReason(geoTier), walking == null ? "walking time unavailable" : `about ${walking} minutes walking`],
      });
    }
  }

  debug.validPairCountBeforeRender = pairs.length;
  pairs.sort((a, b) => geoTierRank(a.geoTier) - geoTierRank(b.geoTier) || b.scores.total - a.scores.total);
  const exactPairs = pairs.filter((pair) => pair.geoTier === "exact_locality");
  const nearbyPairs = pairs.filter((pair) => pair.geoTier === "nearby_radius");
  const broaderPairs = pairs.filter((pair) => pair.geoTier === "broader_fallback");
  const selectedTier = exactPairs.length ? exactPairs : nearbyPairs.length ? nearbyPairs : broaderPairs;
  const diversified = diversifyPairs(selectedTier);
  debug.validPairCountAfterDiversification = diversified.length;
  debug.primaryFailure = restaurants.length === 0 || activities.length === 0 ? "insufficient_domain_candidates" : debug.pairCandidatesEvaluated === 0 ? "no_pair_candidates" : debug.rejectionCounts.market_mismatch >= debug.pairCandidatesEvaluated ? "market_mismatch" : debug.rejectionCounts.walkability_constraint >= debug.pairCandidatesEvaluated ? "walkability_constraint" : debug.rejectionCounts.distance_exceeded >= debug.pairCandidatesEvaluated ? "distance_exceeded" : debug.rejectionCounts.missing_coordinates >= debug.pairCandidatesEvaluated ? "missing_coordinates" : debug.rejectionCounts.schedule_open_hours_conflict >= debug.pairCandidatesEvaluated ? "schedule_open_hours_conflict" : diversified.length === 0 ? "no_valid_pairs" : null;

  if (trace) {
    trace.pairingDebug = debug;
    trace.counts.pairsBuilt = pairs.length;
    trace.counts.pairsValid = diversified.length;
    trace.decisions.push({ stage: "pairing_eligibility", decision: diversified.length ? "pairs_available" : "pairs_unavailable", reason: JSON.stringify({ ...debug, servedGeoTier: diversified[0]?.geoTier ?? null }) });
  }
  return diversified;
}
