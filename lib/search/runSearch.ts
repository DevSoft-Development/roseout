import type { EnterpriseSearchResult } from "@/lib/search/enterprise/types";
import { runOutingSearch as runOutingSearchImpl, type RunOutingSearchInput } from "./runSearchImpl";
import { withSearchUserContext } from "./searchUserContext";

export * from "./runSearchImpl";
export type { RunOutingSearchInput };

export async function runOutingSearch(input: RunOutingSearchInput): Promise<EnterpriseSearchResult> {
  return withSearchUserContext(input.userId ?? null, () => runOutingSearchImpl(input));
}
