import type { SearchPlan } from "../planner/searchPlanTypes";
import type { ScoredCandidate } from "../scoring/scoringTypes";
import type { SearchTrace } from "../observability/searchTrace";
import type { SearchPair } from "./pairingTypes";
import { validatePairDistance } from "./validatePairDistance";
import { haversineMiles } from "../../enterprise/distance";

function coords(candidate: ScoredCandidate) {
  const location = candidate.candidate.candidate.location;
  const lat = Number(location.latitude);
  const lng = Number(location.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
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

export async function buildPairs({ plan, restaurants, activities, trace }: { plan: SearchPlan; restaurants: ScoredCandidate[]; activities: ScoredCandidate[]; trace?: SearchTrace }): Promise<SearchPair[]> {
  const pairs: SearchPair[] = [];
  let evaluated = 0;
  let missingCoordinates = 0;
  let rejectedForDistance = 0;
  let rejectedForSameVenue = 0;

  for (const restaurant of restaurants.slice(0, 20)) {
    for (const activity of activities.slice(0, 20)) {
      evaluated += 1;
      const restaurantCoords = coords(restaurant);
      const activityCoords = coords(activity);
      const sameVenue = String(restaurant.candidate.candidate.location.id) === String(activity.candidate.candidate.location.id);
      if (plan.pairing.sameVenueRequired && !sameVenue) {
        rejectedForSameVenue += 1;
        continue;
      }
      const distance = sameVenue ? 0 : restaurantCoords && activityCoords ? haversineMiles(restaurantCoords.lat, restaurantCoords.lng, activityCoords.lat, activityCoords.lng) : null;
      if (!sameVenue && distance == null) missingCoordinates += 1;
      const walking = distance == null ? null : Math.ceil(distance * 20);
      if (!validatePairDistance(plan, distance, walking)) {
        rejectedForDistance += 1;
        continue;
      }
      const distanceScore = distance == null ? 40 : Math.max(0, 100 - distance * 25);
      const mlPairBoost = Math.min(5, Number(restaurant.candidate.candidate.location.ml_pair_score ?? activity.candidate.candidate.location.ml_pair_score ?? 0));
      const total = (restaurant.scores.total + activity.scores.total) * 0.4 + distanceScore * 0.2 + mlPairBoost;
      pairs.push({
        restaurant,
        activity,
        distanceMiles: distance,
        walkingMinutes: walking,
        walkingMinutesSource: walking == null ? "unavailable" : "estimated",
        scores: { restaurant: restaurant.scores.total, activity: activity.scores.total, distance: distanceScore, combinedQuality: (restaurant.scores.quality + activity.scores.quality) / 2, sequence: 100, mlPairBoost, total },
        reasons: [sameVenue ? "both roles at one venue" : "roles satisfy requested outing", walking == null ? "walking time unavailable" : `about ${walking} minutes walking`],
      });
    }
  }

  pairs.sort((a, b) => b.scores.total - a.scores.total);
  const diversified = diversifyPairs(pairs);
  if (trace) {
    trace.counts.pairsBuilt = pairs.length;
    trace.counts.pairsValid = diversified.length;
    trace.decisions.push({
      stage: "pairing_eligibility",
      decision: diversified.length ? "pairs_available" : "pairs_unavailable",
      reason: JSON.stringify({
        restaurantCandidates: restaurants.length,
        activityCandidates: activities.length,
        evaluated,
        missingCoordinates,
        rejectedForDistance,
        rejectedForSameVenue,
        suppressedLowQuality: Math.max(0, pairs.length - diversified.length),
        validPairs: diversified.length,
        primaryFailure: restaurants.length === 0 ? "no_restaurant_candidates" : activities.length === 0 ? "no_activity_candidates" : evaluated === 0 ? "no_pair_candidates" : rejectedForDistance >= evaluated ? "distance_rejection" : missingCoordinates >= evaluated ? "missing_coordinates" : diversified.length === 0 && pairs.length > 0 ? "low_quality_suppression" : diversified.length === 0 ? "no_valid_pairs" : null,
      }),
    });
  }
  return diversified;
}
