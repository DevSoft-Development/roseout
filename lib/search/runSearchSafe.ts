import type { EnterpriseSearchResult } from "@/lib/search/enterprise/types";
import { runOutingSearch as runBaseOutingSearch, type RunOutingSearchInput } from "./runSearch";
import { applyAudienceSafetyToSearchResult } from "@/lib/search/quality/suppression";

export type { RunOutingSearchInput };

export async function runOutingSearch(input: RunOutingSearchInput): Promise<EnterpriseSearchResult> {
  const result = await runBaseOutingSearch(input);
  return applyAudienceSafetyToSearchResult(String(input.query ?? ""), result);
}
