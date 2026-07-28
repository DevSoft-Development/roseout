import type { RetrievedCandidate } from "./retrievalTypes";
export function deduplicateRetrievedCandidates(items: RetrievedCandidate[]) { return [...new Map(items.map((item) => [String(item.location.id), item])).values()]; }
