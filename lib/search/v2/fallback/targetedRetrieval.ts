import type { RetrievalBudget } from "../retrieval/retrievalBudget";
export function mayRunTargetedRetrieval(budget: RetrievalBudget, role: string) { return budget.claim(`targeted:${role}`); }
