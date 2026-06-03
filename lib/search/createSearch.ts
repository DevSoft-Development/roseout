import { invokeEdgeFunction } from "@/lib/edge-functions";

export type EdgeCreateSearchInput = {
  prompt: string;
  area?: string | null;
  filters?: Record<string, unknown>;
  limit?: number;
  debug?: boolean;
  includeMissingPhotos?: boolean;
  force_llm?: boolean;
};

export type EdgeCreateSearchResponse = {
  success: boolean;
  search_system?: string;
  rawQuery?: string;
  normalizedIntent?: unknown;
  restaurants?: unknown[];
  activities?: unknown[];
  pairs?: unknown[];
  renderMode?: string;
  performance?: Record<string, unknown>;
  debug?: Record<string, unknown>;
};

export function shouldUseEdgeCreateSearch() {
  return process.env.NEXT_PUBLIC_USE_EDGE_CREATE_SEARCH === "true";
}

export async function edgeCreateSearch(input: EdgeCreateSearchInput) {
  return invokeEdgeFunction<EdgeCreateSearchResponse>("create-search", input);
}
