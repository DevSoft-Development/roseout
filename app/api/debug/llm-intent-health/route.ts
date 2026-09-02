import { assistantApiConfigured } from "@/lib/aws/assistant-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") || "steak dinner";

  try {
    const { parseEnterpriseIntent } = await import(
      "@/lib/search/enterprise/intent-parser"
    );

    const withLlm = await parseEnterpriseIntent(q, {
      useLLM: true,
      body: { input: q },
    });

    const withoutLlm = await parseEnterpriseIntent(q, {
      useLLM: false,
      body: { input: q },
    });

    return Response.json({
      ok: true,
      q,
      env: {
        assistantApiConfigured: assistantApiConfigured(),
        providerCredentialLocation: "aws-assistant-api",
        model: process.env.OPENAI_SEARCH_MODEL || "gpt-4.1-mini",
      },
      withLlm: {
        llmWorked: !withLlm.llmError,
        llmError: withLlm.llmError || null,
        raw: withLlm.llmIntentRaw,
        intent: withLlm.intent,
      },
      withoutLlm: {
        intent: withoutLlm.intent,
      },
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
