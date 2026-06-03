import { createQueryHash, normalizeSearchQuery } from "./normalizeQuery.ts";

export async function getCachedIntent(supabase: any, rawQuery: string) {
  const normalizedQuery = normalizeSearchQuery(rawQuery);
  const queryHash = await createQueryHash(normalizedQuery);
  const { data, error } = await supabase
    .from("search_intent_cache")
    .select("*")
    .eq("query_hash", queryHash)
    .maybeSingle();

  if (error || !data) return { cache_hit: false, normalizedQuery, queryHash, intent: null };
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
    return { cache_hit: false, normalizedQuery, queryHash, intent: null, expired: true };
  }

  await supabase
    .from("search_intent_cache")
    .update({ hit_count: (data.hit_count ?? 0) + 1, last_hit_at: new Date().toISOString() })
    .eq("id", data.id);

  return { cache_hit: true, normalizedQuery, queryHash, intent: data.intent_json, parser_source: data.parser_source };
}

export async function saveCachedIntent(supabase: any, rawQuery: string, intent: any, parserSource: string, model?: string) {
  const normalizedQuery = normalizeSearchQuery(rawQuery);
  const queryHash = await createQueryHash(normalizedQuery);
  const days = parserSource === "fast_parser" ? 30 : 14;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  await supabase.from("search_intent_cache").upsert({
    normalized_query: normalizedQuery,
    query_hash: queryHash,
    intent_json: intent,
    parser_source: parserSource,
    model: model ?? null,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  }, { onConflict: "query_hash" });
}
