import type { SearchPlan } from "../planner/searchPlanTypes";
import { runtimeEligibleRoles, runtimeRetrievalTerms } from "../taxonomy/runtimeTaxonomy";
import type { RetrievedCandidate } from "../retrieval/retrievalTypes";
import type { SearchTrace } from "../observability/searchTrace";
import { collectRoleEvidence, evidenceConfidence } from "./roleEvidence";
import type { CandidateRole, RoleEvidence, RoleQualifiedCandidate } from "./roleTypes";
import { hasStrongActivityIdentity, hasStrongRestaurantIdentity, isFamilyUnsafeActivity } from "./domainIdentity";

function canonicalEvidence(candidate: RetrievedCandidate, role: string): RoleEvidence[] {
  return [{ field: "canonical_profile", value: `${role}:${candidate.matchedRetrievalTerms.join(",")}`, strength: "authoritative" }];
}
function isCanonicalFor(candidate: RetrievedCandidate, role: string) { return candidate.retrievalSources.includes("enterprise_search_profile_locations") && candidate.requestedRoles.includes(role); }
function wasRetrievedFor(candidate: RetrievedCandidate, role: string) { return candidate.requestedRoles.includes(role); }

export function assignCandidateRoles({ plan, candidates, trace }: { plan: SearchPlan; candidates: RetrievedCandidate[]; trace?: SearchTrace }) {
  const qualified = candidates.map((candidate): RoleQualifiedCandidate => {
    const roles: RoleQualifiedCandidate["roles"] = [];
    const loc = candidate.location;
    const canonicalRestaurant = isCanonicalFor(candidate, "restaurant");
    const requestedActivityRoles = new Set(candidate.requestedRoles.filter((role) => role.endsWith("_activity") || role === "general_activity"));
    const restaurantIdentity = canonicalRestaurant || hasStrongRestaurantIdentity(loc);
    const activityIdentity = requestedActivityRoles.size > 0 || hasStrongActivityIdentity(loc);

    const restaurantTerms = ["restaurant", "dining", ...plan.restaurant.cuisines.flatMap(runtimeRetrievalTerms), ...plan.restaurant.foods.flatMap(runtimeRetrievalTerms), ...plan.restaurant.features.flatMap(runtimeRetrievalTerms)];
    const restaurantEvidence = canonicalRestaurant ? canonicalEvidence(candidate, "restaurant") : collectRoleEvidence(loc, restaurantTerms);
    if (restaurantIdentity) roles.push({ role: "restaurant", confidence: canonicalRestaurant ? 0.95 : Math.max(0.75, evidenceConfidence(restaurantEvidence, false)), evidence: restaurantEvidence });

    for (const cuisine of plan.restaurant.cuisines) {
      const configuredRole = runtimeEligibleRoles(cuisine).find((role) => role.endsWith("_restaurant"));
      const requestedCuisineRole = (configuredRole ?? "restaurant") as CandidateRole;
      const canonicalCuisine = canonicalRestaurant && candidate.matchedRetrievalTerms.some((term) => runtimeRetrievalTerms(cuisine).includes(term));
      const evidence = canonicalCuisine ? canonicalEvidence(candidate, requestedCuisineRole) : collectRoleEvidence(loc, runtimeRetrievalTerms(cuisine));
      const confidence = canonicalCuisine ? 0.95 : restaurantIdentity ? evidenceConfidence(evidence) : 0;
      if (confidence) roles.push({ role: requestedCuisineRole, confidence, evidence });
    }

    const genericActivityRequested = plan.activity.required && plan.activity.categories.length === 0;
    if (genericActivityRequested && activityIdentity && !(plan.audience.minorsPresent && isFamilyUnsafeActivity(loc))) {
      const retrievedGeneric = requestedActivityRoles.has("general_activity");
      const evidence = retrievedGeneric ? canonicalEvidence(candidate, "general_activity") : collectRoleEvidence(loc, ["activity", "entertainment", "experience", "things to do", "family friendly"]);
      roles.push({ role: "general_activity", confidence: retrievedGeneric ? 0.9 : Math.max(0.72, evidenceConfidence(evidence, false)), evidence });
    }

    for (const category of plan.activity.categories) {
      if (plan.audience.minorsPresent && isFamilyUnsafeActivity(loc)) continue;
      const configuredRole = runtimeEligibleRoles(category).find((role) => role.endsWith("_activity"));
      const exactRequestedRole = (configuredRole ?? `${category}_activity`) as CandidateRole;
      const retrievedForRole = wasRetrievedFor(candidate, exactRequestedRole) || wasRetrievedFor(candidate, `${category}_activity`);
      const canonicalCategory = isCanonicalFor(candidate, exactRequestedRole);
      const evidence = retrievedForRole || canonicalCategory ? canonicalEvidence(candidate, exactRequestedRole) : collectRoleEvidence(loc, runtimeRetrievalTerms(category));
      const confidence = canonicalCategory ? 0.95 : retrievedForRole ? 0.9 : activityIdentity ? evidenceConfidence(evidence) : 0;
      if (confidence && (retrievedForRole || canonicalCategory || evidence.some((item) => item.strength !== "supporting"))) roles.push({ role: exactRequestedRole, confidence, evidence });
    }
    return { candidate, roles };
  }).filter((item) => item.roles.length);

  if (trace) {
    trace.counts.restaurantQualified = qualified.filter((item) => item.roles.some((role) => role.role === "restaurant" || role.role.endsWith("_restaurant"))).length;
    trace.counts.activityQualified = qualified.filter((item) => item.roles.some((role) => role.role === "general_activity" || role.role.endsWith("_activity"))).length;
    trace.counts.dualRoleQualified = qualified.filter((item) => item.roles.some((role) => role.role === "restaurant" || role.role.endsWith("_restaurant")) && item.roles.some((role) => role.role === "general_activity" || role.role.endsWith("_activity"))).length;
  }
  return qualified;
}
