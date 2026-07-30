import type { SearchPlan } from "../planner/searchPlanTypes";
import { activities, activityRetrievalTerms } from "../taxonomy";
import type { RetrievedCandidate } from "../retrieval/retrievalTypes";
import type { SearchTrace } from "../observability/searchTrace";
import { collectRoleEvidence, evidenceConfidence } from "./roleEvidence";
import type { CandidateRole, RoleEvidence, RoleQualifiedCandidate } from "./roleTypes";
import { hasStrongActivityIdentity, hasStrongRestaurantIdentity, isFamilyUnsafeActivity } from "./domainIdentity";

const cuisineRoles: Record<string, CandidateRole> = {
  sushi: "sushi_restaurant",
  steakhouse: "steakhouse_restaurant",
  seafood: "seafood_restaurant",
  halal: "halal_restaurant",
  vegan: "vegan_restaurant",
};

function canonicalEvidence(candidate: RetrievedCandidate, role: string): RoleEvidence[] {
  return [{
    field: "canonical_profile",
    value: `${role}:${candidate.matchedRetrievalTerms.join(",")}`,
    strength: "authoritative",
  }];
}

function isCanonicalFor(candidate: RetrievedCandidate, role: string) {
  return candidate.retrievalSources.includes("enterprise_search_profile_locations")
    && candidate.requestedRoles.includes(role);
}

export function assignCandidateRoles({ plan, candidates, trace }: { plan: SearchPlan; candidates: RetrievedCandidate[]; trace?: SearchTrace }) {
  const qualified = candidates
    .map((candidate): RoleQualifiedCandidate => {
      const roles: RoleQualifiedCandidate["roles"] = [];
      const loc = candidate.location;
      const canonicalRestaurant = isCanonicalFor(candidate, "restaurant");
      const canonicalActivityRoles = new Set(candidate.requestedRoles.filter((role) => role.endsWith("_activity") || role === "general_activity"));
      const restaurantIdentity = canonicalRestaurant || hasStrongRestaurantIdentity(loc);
      const activityIdentity = canonicalActivityRoles.size > 0 || hasStrongActivityIdentity(loc);

      const restaurantEvidence = canonicalRestaurant
        ? canonicalEvidence(candidate, "restaurant")
        : collectRoleEvidence(loc, [
            "restaurant", "dining", "cafe", "bistro",
            ...plan.restaurant.cuisines,
            ...plan.restaurant.foods,
            ...plan.restaurant.features,
          ]);
      if (restaurantIdentity) {
        roles.push({ role: "restaurant", confidence: canonicalRestaurant ? 0.95 : Math.max(0.75, evidenceConfidence(restaurantEvidence, false)), evidence: restaurantEvidence });
      }

      for (const cuisine of plan.restaurant.cuisines) {
        const requestedCuisineRole = cuisineRoles[cuisine] ?? "restaurant";
        const canonicalCuisine = canonicalRestaurant && candidate.matchedRetrievalTerms.includes(cuisine);
        const evidence = canonicalCuisine ? canonicalEvidence(candidate, requestedCuisineRole) : collectRoleEvidence(loc, [cuisine]);
        const confidence = canonicalCuisine ? 0.95 : restaurantIdentity ? evidenceConfidence(evidence) : 0;
        if (confidence) roles.push({ role: requestedCuisineRole, confidence, evidence });
      }

      const genericActivityRequested = plan.activity.required && plan.activity.categories.length === 0;
      if (genericActivityRequested && activityIdentity && !(plan.audience.minorsPresent && isFamilyUnsafeActivity(loc))) {
        const canonicalGeneric = canonicalActivityRoles.has("general_activity");
        const evidence = canonicalGeneric
          ? canonicalEvidence(candidate, "general_activity")
          : collectRoleEvidence(loc, ["activity", "entertainment", "experience", "things to do", "family friendly"]);
        roles.push({ role: "general_activity", confidence: canonicalGeneric ? 0.95 : Math.max(0.72, evidenceConfidence(evidence, false)), evidence });
      }

      for (const category of plan.activity.categories) {
        if (plan.audience.minorsPresent && isFamilyUnsafeActivity(loc)) continue;
        const exactRequestedRole = `${category}_activity` as CandidateRole;
        const canonicalCategory = isCanonicalFor(candidate, exactRequestedRole);
        const role = canonicalCategory
          ? exactRequestedRole
          : (activities[category]?.eligibleRoles?.[0] ?? exactRequestedRole) as CandidateRole;
        const evidence = canonicalCategory ? canonicalEvidence(candidate, role) : collectRoleEvidence(loc, activityRetrievalTerms(category));
        const confidence = canonicalCategory ? 0.95 : activityIdentity ? evidenceConfidence(evidence) : 0;
        if (confidence && (canonicalCategory || evidence.some((item) => item.strength !== "supporting"))) {
          roles.push({ role, confidence, evidence });
        }
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
