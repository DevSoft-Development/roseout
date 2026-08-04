import type { SearchPlan } from "./searchPlanTypes";
export function validateSearchPlan(plan: SearchPlan): void {
  if (!plan.rawQuery.trim()) throw new Error("SEARCH_PLAN_EMPTY_QUERY");
  if (plan.pairing.required && (!plan.restaurant.required || !plan.activity.required)) throw new Error("SEARCH_PLAN_INVALID_PAIRING");
  if (plan.pairing.sameVenueRequired && !plan.pairing.required) throw new Error("SEARCH_PLAN_INVALID_SAME_VENUE");
  if (plan.geo.radiusMiles <= 0) throw new Error("SEARCH_PLAN_INVALID_RADIUS");
  if (plan.travel.mode === "walking" && plan.travel.constraint === "none") throw new Error("SEARCH_PLAN_WALKING_REQUIRES_CONSTRAINT");
  if (plan.travel.constraint === "hard" && (plan.pairing.maxDistanceMiles == null || plan.pairing.maxDistanceMiles <= 0)) throw new Error("SEARCH_PLAN_HARD_DISTANCE_REQUIRES_LIMIT");
  if (plan.travel.mode === "walking" && plan.travel.maxWalkingMinutes != null && plan.travel.maxWalkingMinutes <= 0) throw new Error("SEARCH_PLAN_INVALID_WALKING_LIMIT");
  if (plan.travel.mode === "driving" && plan.travel.maxDrivingMinutes != null && plan.travel.maxDrivingMinutes <= 0) throw new Error("SEARCH_PLAN_INVALID_DRIVING_LIMIT");
  if (plan.pairing.requireWalkable && plan.travel.mode !== "walking") throw new Error("SEARCH_PLAN_WALKABLE_REQUIRES_WALKING_MODE");
}
