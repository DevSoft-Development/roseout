import { handleOptions } from "../_shared/cors.ts";
<<<<<<< HEAD
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
=======
import { badRequest, ok, serverError, unauthorized } from "../_shared/response.ts";
import { createSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import { getUserFromRequest } from "../_shared/auth.ts";
import { fastParseSearchIntent, normalizeIntent, parserConfidence } from "../_shared/fastSearchParser.ts";
import { getCachedIntent, saveCachedIntent } from "../_shared/searchIntentCache.ts";
import { logEdgeFunctionRun, safeError, startTimer } from "../_shared/logger.ts";

async function llmParse(prompt: string, fastIntent: Record<string, unknown>, signal: AbortSignal) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return { intent: fastIntent, source: "fallback", model: null, llm_used: false, error: "OPENAI_API_KEY missing" };
  const model = Deno.env.get("SEARCH_LLM_MODEL") || "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", signal,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, response_format: { type: "json_object" }, temperature: 0.1, messages: [
      { role: "system", content: "Return strict JSON search intent for TheOutHaven. Preserve fields from the provided fast intent where sensible." },
      { role: "user", content: JSON.stringify({ prompt, fastIntent }) },
    ] }),
  });
  if (!res.ok) throw new Error(`OpenAI parsing failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return { intent: JSON.parse(data.choices?.[0]?.message?.content || "{}"), source: "llm", model, llm_used: true };
}

Deno.serve(async (req) => {
  const options = handleOptions(req); if (options) return options;
  const timer = startTimer();
  let supabase;
  try {
    supabase = createSupabaseAdminClient();
    const user = await getUserFromRequest(req, supabase);
    if (!user) return unauthorized("Valid user JWT required to parse search intent");
    const body = await req.json().catch(() => ({}));
    const rawQuery = String(body.prompt ?? body.query ?? "").trim();
    if (!rawQuery) return badRequest("prompt is required");
    const cached = await getCachedIntent(supabase, rawQuery);
    if (cached.cache_hit) {
      await logEdgeFunctionRun(supabase, { function_name: "parse-search-intent", status: "success", user_id: user.id, input_summary: { rawQuery }, output_summary: { parser_source: "cache" }, duration_ms: timer() });
      return ok({ success: true, rawQuery, normalizedIntent: cached.intent, parser_source: "cache", cache_hit: true, llm_used: false, timingMs: timer(), debug: body.debug ? cached : undefined });
    }
    const fastIntent = fastParseSearchIntent(rawQuery, { area: body.area });
    let finalIntent = fastIntent;
    let parserSource = "fast_parser";
    let llmUsed = false;
    let llmMs = 0;
    const forceLlm = body.force_llm === true || body.debug?.force_llm === true;
    const needsLlm = forceLlm || parserConfidence(fastIntent) < 0.75 || fastIntent.searchType === "unknown";
    if (needsLlm) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);
      const llmStarted = Date.now();
      try {
        const llm = await llmParse(rawQuery, fastIntent, controller.signal);
        finalIntent = normalizeIntent({ ...fastIntent, ...llm.intent, parser_source: llm.source, confidence: llm.source === "llm" ? 0.86 : parserConfidence(fastIntent) });
        parserSource = llm.source;
        llmUsed = llm.llm_used;
        await saveCachedIntent(supabase, rawQuery, finalIntent, parserSource, llm.model);
      } catch (error) {
        parserSource = "fallback";
        finalIntent = normalizeIntent({ ...fastIntent, parser_source: "fallback", llm_error: safeError(error) });
      } finally {
        clearTimeout(timeout); llmMs = Date.now() - llmStarted;
      }
    } else {
      await saveCachedIntent(supabase, rawQuery, finalIntent, "fast_parser");
    }
    await logEdgeFunctionRun(supabase, { function_name: "parse-search-intent", status: "success", user_id: user.id, input_summary: { rawQuery }, output_summary: { parserSource, llmUsed }, duration_ms: timer(), metadata: { llmMs } });
    return ok({ success: true, rawQuery, normalizedIntent: finalIntent, parser_source: parserSource, cache_hit: false, llm_used: llmUsed, timingMs: timer(), debug: body.debug ? { ...cached, llm_ms: llmMs } : undefined });
  } catch (error) {
    if (supabase) await logEdgeFunctionRun(supabase, { function_name: "parse-search-intent", status: "error", error_message: safeError(error), duration_ms: timer() });
>>>>>>> 62b07568ac9db33da882568ffc4086080fee38c3
    return serverError("parse-search-intent failed", safeError(error));
  }
});
