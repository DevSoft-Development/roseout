import { handleOptions } from "../_shared/cors.ts";
import { badRequest, ok, serverError } from "../_shared/response.ts";
import { createSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import { fastParseSearchIntent, parserConfidence } from "../_shared/fastSearchParser.ts";
import { getCachedIntent, saveCachedIntent } from "../_shared/searchIntentCache.ts";
import { logEdgeFunctionRun, safeError, startTimer } from "../_shared/logger.ts";

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  const elapsed = startTimer();
  const functionName = "parse-search-intent";
  let supabase: any = null;

  try {
    const body = await req.json().catch(() => ({}));
    const prompt = String(body.prompt ?? body.query ?? "").trim();
    if (!prompt) return badRequest("Missing prompt");

    supabase = createSupabaseAdminClient();
    const cached = await getCachedIntent(supabase, prompt);
    if (cached.cache_hit) {
      await logEdgeFunctionRun(supabase, { function_name: functionName, status: "success", duration_ms: elapsed(), input_summary: { prompt }, output_summary: { parser_source: "cache" } });
      return ok({ success: true, rawQuery: prompt, normalizedIntent: cached.intent, parser_source: "cache", cache_hit: true, llm_used: false, timingMs: elapsed() });
    }

    const fastIntent = fastParseSearchIntent(prompt, body);
    const confidence = parserConfidence(fastIntent);
    const forceLlm = body.force_llm === true || body.debug?.force_llm === true;

    if (confidence >= 0.75 && !forceLlm) {
      await saveCachedIntent(supabase, prompt, fastIntent, "fast_parser");
      await logEdgeFunctionRun(supabase, { function_name: functionName, status: "success", duration_ms: elapsed(), input_summary: { prompt }, output_summary: { parser_source: "fast_parser", confidence } });
      return ok({ success: true, rawQuery: prompt, normalizedIntent: fastIntent, parser_source: "fast_parser", cache_hit: false, llm_used: false, timingMs: elapsed() });
    }

    // Safe fallback for now. This keeps the function deployable even before OPENAI_API_KEY is configured.
    await saveCachedIntent(supabase, prompt, fastIntent, "fallback");
    await logEdgeFunctionRun(supabase, { function_name: functionName, status: "success", duration_ms: elapsed(), input_summary: { prompt }, output_summary: { parser_source: "fallback", confidence } });
    return ok({ success: true, rawQuery: prompt, normalizedIntent: fastIntent, parser_source: "fallback", cache_hit: false, llm_used: false, timingMs: elapsed() });
  } catch (error) {
    if (supabase) await logEdgeFunctionRun(supabase, { function_name: functionName, status: "error", duration_ms: elapsed(), error_message: safeError(error).message });
    return serverError("parse-search-intent failed", safeError(error));
  }
});
