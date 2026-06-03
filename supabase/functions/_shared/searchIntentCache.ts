<<<<<<< HEAD
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
=======
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { normalizeSearchQuery, createQueryHash } from "./normalizeQuery.ts";

export function shouldUseCachedIntent(row: Record<string, unknown> | null): boolean {
  if (!row) return false;
  if (!row.expires_at) return true;
  return new Date(String(row.expires_at)).getTime() > Date.now();
}

export async function getCachedIntent(supabase: SupabaseClient, rawQuery: string): Promise<Record<string, unknown>> {
  const normalizedQuery = normalizeSearchQuery(rawQuery);
  const queryHash = await createQueryHash(normalizedQuery);
  try {
    const { data, error } = await supabase.from("search_intent_cache").select("*").eq("query_hash", queryHash).maybeSingle();
    if (error || !shouldUseCachedIntent(data)) return { cache_hit: false, cache_key: queryHash, normalized_query: normalizedQuery };
    await supabase.from("search_intent_cache").update({ hit_count: Number(data.hit_count ?? 0) + 1, last_hit_at: new Date().toISOString() }).eq("query_hash", queryHash);
    return { cache_hit: true, cache_key: queryHash, cache_parser_source: data.parser_source, normalized_query: normalizedQuery, intent: data.intent_json };
  } catch {
    return { cache_hit: false, cache_key: queryHash, normalized_query: normalizedQuery };
  }
}

export async function saveCachedIntent(supabase: SupabaseClient, rawQuery: string, intent: unknown, parserSource: string, model?: string | null): Promise<Record<string, unknown>> {
  const normalizedQuery = normalizeSearchQuery(rawQuery);
  const queryHash = await createQueryHash(normalizedQuery);
  const days = parserSource === "llm" ? 14 : 30;
  const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
  try {
    await supabase.from("search_intent_cache").upsert({ normalized_query: normalizedQuery, query_hash: queryHash, intent_json: intent, parser_source: parserSource, model: model ?? null, expires_at: expiresAt, updated_at: new Date().toISOString() }, { onConflict: "query_hash" });
  } catch (error) {
    console.warn("[search-intent-cache] save skipped", error instanceof Error ? error.message : String(error));
  }
  return { cache_key: queryHash, normalized_query: normalizedQuery };
>>>>>>> 62b07568ac9db33da882568ffc4086080fee38c3
}
