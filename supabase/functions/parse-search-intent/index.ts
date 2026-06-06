import { handleOptions } from "../_shared/cors.ts";
import { badRequest, ok, serverError, unauthorized } from "../_shared/response.ts";
import { createSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import { getUserFromRequest } from "../_shared/auth.ts";
import { fastParseSearchIntent, normalizeIntent, parserConfidence } from "../_shared/fastSearchParser.ts";
import { getCachedIntent, saveCachedIntent } from "../_shared/searchIntentCache.ts";
import { logEdgeFunctionRun, safeError, startTimer } from "../_shared/logger.ts";

const SEARCH_INTENT_FAST_MODEL = Deno.env.get("SEARCH_INTENT_FAST_MODEL") || "gpt-4o-mini";
const SEARCH_INTENT_FALLBACK_MODEL = Deno.env.get("SEARCH_INTENT_FALLBACK_MODEL") || "gpt-4o";
const SEARCH_INTENT_LLM_TIMEOUT_MS = Number(Deno.env.get("SEARCH_INTENT_LLM_TIMEOUT_MS") || 1400);
const SEARCH_INTENT_FALLBACK_TIMEOUT_MS = Number(Deno.env.get("SEARCH_INTENT_FALLBACK_TIMEOUT_MS") || 2200);
void SEARCH_INTENT_FALLBACK_TIMEOUT_MS;
const SEARCH_INTENT_CACHE_VERSION = Deno.env.get("SEARCH_INTENT_CACHE_VERSION") || "intent-v4-fast-model";

async function llmParse(prompt: string, fastIntent: Record<string, unknown>, signal: AbortSignal) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return { intent: fastIntent, source: "fallback", model: null, llm_used: false, error: "OPENAI_API_KEY missing" };
  const model = SEARCH_INTENT_FAST_MODEL;
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
    let parserSource = "fast_path";
    let llmUsed = false;
    let llmMs = 0;
    const useFastPath = body.useFastPath !== false;
    const forceLlm = body.force_llm === true || body.debug?.force_llm === true || !useFastPath;
    const needsLlm = forceLlm || parserConfidence(fastIntent) < 0.75 || fastIntent.searchType === "unknown";
    if (needsLlm) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), SEARCH_INTENT_LLM_TIMEOUT_MS);
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
      await saveCachedIntent(supabase, rawQuery, finalIntent, "fast_path");
    }
    await logEdgeFunctionRun(supabase, { function_name: "parse-search-intent", status: "success", user_id: user.id, input_summary: { rawQuery }, output_summary: { parserSource, llmUsed }, duration_ms: timer(), metadata: { llmMs, intentParserSource: parserSource, fastPathMatched: parserSource === "fast_path", fastPathReason: parserSource === "fast_path" ? "edge_fast_parser_confidence_threshold" : (useFastPath ? "llm_required" : "fast_path_disabled") } });
    return ok({ success: true, rawQuery, normalizedIntent: finalIntent, parser_source: parserSource, cache_hit: false, llm_used: llmUsed, timingMs: timer(), debug: body.debug ? { ...cached, llm_ms: llmMs, intentParserSource: parserSource, intentLlmModel: llmUsed ? SEARCH_INTENT_FAST_MODEL : null, intentLlmFastModel: SEARCH_INTENT_FAST_MODEL, intentLlmFallbackModel: SEARCH_INTENT_FALLBACK_MODEL, intentCacheVersion: SEARCH_INTENT_CACHE_VERSION, fastPathMatched: parserSource === "fast_path", fastPathReason: parserSource === "fast_path" ? "edge_fast_parser_confidence_threshold" : (useFastPath ? "llm_required" : "fast_path_disabled") } : undefined });
  } catch (error) {
    if (supabase) await logEdgeFunctionRun(supabase, { function_name: "parse-search-intent", status: "error", error_message: safeError(error), duration_ms: timer() });
    return serverError("parse-search-intent failed", safeError(error));
  }
});
