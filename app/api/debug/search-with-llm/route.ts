export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") || "steak dinner";

  try {
    const { runEnterpriseSearch } = await import("@/lib/search/enterprise");

    const result = await runEnterpriseSearch(q, {
      useLLM: true,
      body: { input: q },
      displayLimit: 10,
    });

    return Response.json({
      ok: true,
      q,
      restaurants: result.restaurants?.length || 0,
      activities: result.activities?.length || 0,
      pairs: result.pairs?.length || 0,
      matched_locations: result.matched_locations?.length || 0,
      render_mode: result.render_mode,
      reply: result.reply,
      llmError: result.debug?.llmError || null,
      normalizedIntent: result.debug?.normalizedIntent || null,
      first_restaurant: result.restaurants?.[0] || null,
      first_activity: result.activities?.[0] || null,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        q,
        error: error instanceof Error ? error.message : String(error),
        stack:
          process.env.NODE_ENV === "production"
            ? undefined
            : error instanceof Error
              ? error.stack
              : null,
      },
      { status: 200 },
    );
  }
}
