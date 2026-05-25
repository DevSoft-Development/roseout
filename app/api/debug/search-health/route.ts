import { runTheOutHavenSearch } from "@/lib/search/searchPipeline";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const query =
    typeof body?.message === "string"
      ? body.message
      : typeof body?.input === "string"
        ? body.input
        : typeof body?.query === "string"
          ? body.query
          : "";

  const startedAt = Date.now();
  const result = await runTheOutHavenSearch(query, { ...body, debug: true });
  const durationMs = Date.now() - startedAt;

  return Response.json({
    success: true,
    input: query,
    durationMs,
    diagnostics: {
      stage: "final_response",
      counts: {
        restaurants: result.restaurants?.length ?? 0,
        activities: result.activities?.length ?? 0,
        pairs: result.pairs?.length ?? 0,
      },
      fallback: {
        restaurant: Boolean(result?.debug?.fallbackRestaurantUsed),
        activity: Boolean(result?.debug?.fallbackActivityUsed),
      },
      debug: result.debug ?? {},
    },
    result,
  });
}
