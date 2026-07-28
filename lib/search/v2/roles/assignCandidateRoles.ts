import type { SearchPlan } from "../planner/searchPlanTypes";
import { activities, activityRetrievalTerms } from "../taxonomy";
import type { RetrievedCandidate } from "../retrieval/retrievalTypes";
import type { SearchTrace } from "../observability/searchTrace";
import { collectRoleEvidence, evidenceConfidence } from "./roleEvidence";
import type { CandidateRole, RoleQualifiedCandidate } from "./roleTypes";
import { hasStrongActivityIdentity, hasStrongRestaurantIdentity, isFamilyUnsafeActivity } from "./domainIdentity";

const cuisineRoles: Record<string, CandidateRole> = {
  sushi: "sushi_restaurant",
  steakhouse: "steakhouse_restaurant",
  seafood: "seafood_restaurant",
  halal: "halal_restaurant",
  vegan: "vegan_restaurant",
};

export function assignCandidateRoles({ plan, candidates, trace }: { plan: SearchPlan; candidates: RetrievedCandidate[]; trace?: SearchTrace }) {
  const qualified = candidates
    .map((candidate): RoleQualifiedCandidate => {
      const roles: RoleQualifiedCandidate["roles"] = [];
      const loc = candidate.location;
      const restaurantIdentity = hasStrongRestaurantIdentity(loc);
      const activityIdentity = hasStrongActivityIdentity(loc);

      const restaurantEvidence = collectRoleEvidence(loc, [
        "restaurant", "dining", "cafe", "bistro",
        ...plan.restaurant.cuisines,
        ...plan.restaurant.foods,
        ...plan.restaurant.features,
      ]);
      if (restaurantIdentity) {
        roles.push({ role: "restaurant", confidence: Math.max(0.75, evidenceConfidence(restaurantEvidence, false)), evidence: restaurantEvidence });
      }

      for (const cuisine of plan.restaurant.cuisines) {
        const evidence = collectRoleEvidence(loc, [cuisine]);
        const confidence = restaurantIdentity ? evidenceConfidence(evidence) : 0;
        if (confidence) roles.push({ role: cuisineRoles[cuisine] ?? "restaurant", confidence, evidence });
      }

      const genericActivityRequested = plan.activity.required && plan.activity.categories.length === 0;
      if (genericActivityRequested && activityIdentity && !(plan.audience.minorsPresent && isFamilyUnsafeActivity(loc))) {
        const evidence = collectRoleEvidence(loc, ["activity", "entertainment", "experience", "things to do", "family friendly"]);
        roles.push({ role: "general_activity", confidence: Math.max(0.72, evidenceConfidence(evidence, false)), evidence });
      }

      for (const category of plan.activity.categories) {
        if (plan.audience.minorsPresent && isFamilyUnsafeActivity(loc)) continue;
        const evidence = collectRoleEvidence(loc, activityRetrievalTerms(category));
        const confidence = activityIdentity ? evidenceConfidence(evidence) : 0;
        const role = (activities[category]?.eligibleRoles?.[0] ?? "general_activity") as CandidateRole;
        if (confidence && evidence.some((item) => item.strength !== "supporting")) roles.push({ role, confidence, evidence });
      }

      return { candidate, roles };
    })
    .filter((item) => item.roles.length);

  if (trace) {
    trace.counts.restaurantQualified = qualified.filter((item) => item.roles.some((role) => role.role === "restaurant" || role.role.endsWith("_restaurant"))).length;
    trace.counts.activityQualified = qualified.filter((item) => item.roles.some((role) => role.role === "general_activity" || role.role.endsWith("_activity"))).length;
    trace.counts.dualRoleQualified = qualified.filter((item) => item.roles.some((role) => role.role === "restaurant" || role.role.endsWith("_restaurant")) && item.roles.some((role) => role.role === "general_activity" || role.role.endsWith("_activity"))).length;
  }
  return qualified;
}
