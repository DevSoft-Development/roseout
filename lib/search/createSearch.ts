import { invokeEdgeFunction } from "@/lib/edge-functions";

type CreateSearchOptions = {
  accessToken?: string | null;
  fallbackDisabled?: boolean;
  legacySearch: () => Promise<Record<string, unknown>>;
};

export function isEdgeCreateSearchEnabled(): boolean {
  return process.env.NEXT_PUBLIC_USE_EDGE_CREATE_SEARCH === "true";
}

export async function runCreateSearchWithEdgeFallback(
  body: Record<string, unknown>,
  options: CreateSearchOptions,
): Promise<Record<string, unknown>> {
  if (!isEdgeCreateSearchEnabled()) return options.legacySearch();

  const { data, error } = await invokeEdgeFunction<Record<string, unknown>>("create-search", body, {
    accessToken: options.accessToken,
  });

  if (!error && data?.success) {
    return {
      ...data,
      source: "edge",
      render_mode: data.render_mode ?? data.renderMode,
      renderMode: data.renderMode ?? data.render_mode,
      debug: {
        ...(typeof data.debug === "object" && data.debug ? data.debug : {}),
        source: "edge",
      },
    };
  }

  console.error("[create-search] Edge Function failed; falling back to legacy search", error);
  if (options.fallbackDisabled) {
    throw new Error(error?.message || "Edge create-search failed");
  }
  const legacy = await options.legacySearch();
  return {
    ...legacy,
    source: "legacy",
    debug: {
      ...(typeof legacy.debug === "object" && legacy.debug ? legacy.debug : {}),
      source: "legacy",
      edge_error: error,
    },
  };
}
