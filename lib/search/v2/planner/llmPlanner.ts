import type { SearchPlan } from "./searchPlanTypes";
export type PlannerCompletion = Partial<Pick<SearchPlan, "occasion" | "partySize" | "plannedFor">>;
/** LLM completions are intentionally restricted to unresolved, non-explicit fields. */
export function mergeLlmCompletion(plan: SearchPlan, completion: PlannerCompletion): SearchPlan { return { ...plan, occasion: plan.occasion ?? completion.occasion ?? null, partySize: plan.partySize ?? completion.partySize ?? null, plannedFor: plan.plannedFor ?? completion.plannedFor ?? null, parser: { source: "hybrid", reasons: [...plan.parser.reasons, "LLM filled unresolved optional fields"] } }; }
