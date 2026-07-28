import type { SearchPlan } from "../planner/searchPlanTypes";
import { activities, activityRetrievalTerms } from "../taxonomy";
import type { RetrievedCandidate } from "../retrieval/retrievalTypes";
import type { SearchTrace } from "../observability/searchTrace";
import { collectRoleEvidence, evidenceConfidence } from "./roleEvidence";
import type { CandidateRole, RoleQualifiedCandidate } from "./roleTypes";

const cuisineRoles: Record<string, CandidateRole> = {
  sushi: "sushi_restaurant",
  steakhouse: "steakhouse_restaurant",
  seafood: "seafood_restaurant",
  halal: "halal_restaurant",
  vegan: "vegan_restaurant",
};

function normalizedIdentity(location: any) {
  return [
    location.location_type,
    location.primary_category,
    location.activity_type,
    location.cuisine,
    location.cuisine_type,
    location.name,
    location.restaurant_name,
    location.activity_name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function assignCandidateRoles({
  plan,
  candidates,
  trace,
}: {
  plan: SearchPlan;
  candidates: RetrievedCandidate[];
  trace?: SearchTrace;
}) {
  const qualified = candidates
    .map((candidate): RoleQualifiedCandidate => {
      const roles: RoleQualifiedCandidate["roles"] = [];
      const loc = candidate.location;
      const identity = normalizedIdentity(loc);
      const explicitRestaurantIdentity = Boolean(
        loc.restaurant_name ||
          loc.cuisine ||
          loc.cuisine_type ||
          /\b(restaurant|dining|cafe|café|bistro|steakhouse|bakery|brunch)\b/.test(identity),
      );
      const explicitActivityIdentity = Boolean(
        loc.activity_name ||
          loc.activity_type ||
          /\b(activity|arcade|bowling|museum|gallery|karaoke|hookah|sports bar|theater|theatre|comedy|mini golf|live music|nightclub|experience)\b/.test(identity),
      );

      const restaurantEvidence = collectRoleEvidence(loc, [
        "restaurant",
        "dining",
        "cafe",
        "bistro",
        ...plan.restaurant.cuisines,
        ...plan.restaurant.foods,
        ...plan.restaurant.features,
      ]);
      if (explicitRestaurantIdentity) {
        roles.push({
          role: "restaurant",
          confidence: Math.max(0.75, evidenceConfidence(restaurantEvidence, false)),
          evidence: restaurantEvidence,
        });
      }

      for (const cuisine of plan.restaurant.cuisines) {
        const evidence = collectRoleEvidence(loc, [cuisine]);
        const confidence = explicitRestaurantIdentity ? evidenceConfidence(evidence) : 0;
        if (confidence) roles.push({ role: cuisineRoles[cuisine] ?? "restaurant", confidence, evidence });
      }

      for (const category of plan.activity.categories) {
        const evidence = collectRoleEvidence(loc, activityRetrievalTerms(category));
        const confidence = explicitActivityIdentity ? evidenceConfidence(evidence) : 0;
        const role = (activities[category]?.eligibleRoles?.[0] ?? "general_activity") as CandidateRole;
        // Supporting text alone cannot turn a restaurant into an activity. A restaurant may be dual-role only with explicit activity identity and strong/authoritative evidence.
        if (confidence && evidence.some((item) => item.strength !== "supporting")) {
          roles.push({ role, confidence, evidence });
        }
      }

      return { candidate, roles };
    })
    .filter((item) => item.roles.length);

  if (trace) {
    trace.counts.restaurantQualified = qualified.filter((item) =>
      item.roles.some((role) => role.role === "restaurant" || role.role.endsWith("_restaurant")),
    ).length;
    trace.counts.activityQualified = qualified.filter((item) =>
      item.roles.some((role) => role.role.endsWith("_activity")),
    ).length;
    trace.counts.dualRoleQualified = qualified.filter(
      (item) =>
        item.roles.some((role) => role.role === "restaurant" || role.role.endsWith("_restaurant")) &&
        item.roles.some((role) => role.role.endsWith("_activity")),
    ).length;
  }
  return qualified;
}
