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
      displayLimit: 5,
    });

    return Response.json({
      ok: true,
      q,
      restaurants: result.restaurants?.length || 0,
      activities: result.activities?.length || 0,
      pairs: result.pairs?.length || 0,
      render_mode: result.render_mode,
      reply: result.reply,
      debug: result.debug,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error("[debug/search-test] failed", {
      q,
      message,
      stack: error instanceof Error ? error.stack : null,
    });

    return Response.json(
      {
        ok: false,
        q,
        error: message,
      },
      { status: 200 },
    );
  }
}
