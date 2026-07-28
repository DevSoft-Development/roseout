import type { PublicSearchResponseV2 } from "./responseTypes"; import type { SearchTrace } from "../observability/searchTrace";
export function buildDebugSearchResponse(response: PublicSearchResponseV2, trace: SearchTrace) { return { ...response, debug: { trace } }; }
