import { buildSearchPlan } from "@/lib/search/v2/planner/buildSearchPlan";

export type ResolvedPlannerType = "outing" | "restaurant" | "activity";

export async function resolvePlanTypeWithSearchV2(query: string): Promise<ResolvedPlannerType> {
  const plan = await buildSearchPlan({
    input: {
      query: query.trim(),
      selectedLane: "auto",
    },
  });

  if (plan.mode === "restaurant_only") return "restaurant";
  if (plan.mode === "activity_only") return "activity";
  return "outing";
}
