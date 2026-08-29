import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolveSearchMlRuntimeConfig } from "@/lib/search/huggingFaceEmbedding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function authorized(request: Request) {
  const provided = request.headers.get("authorization");
  const cronSecret = String(process.env.CRON_SECRET || "").trim();
  if (cronSecret && provided === `Bearer ${cronSecret}`) return true;
  const config = await resolveSearchMlRuntimeConfig().catch(() => null);
  return Boolean(config?.token && provided === `Bearer ${config.token}`);
}

function uuid(value: unknown) {
  const text = String(value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

function displayedIds(metadata: any) {
  const values = [
    metadata?.ml_result_ids,
    metadata?.resultIds,
    metadata?.result_ids,
    metadata?.restaurantIds,
    metadata?.restaurant_ids,
    metadata?.activityIds,
    metadata?.activity_ids,
    metadata?.locationIds,
    metadata?.location_ids,
  ].flatMap((value) => Array.isArray(value) ? value : []);
  return [...new Set(values.map(uuid).filter(Boolean))] as string[];
}

function trainingDocument(location: any) {
  const list = (value: unknown) => Array.isArray(value) ? value.map(String).filter(Boolean).join(", ") : value == null ? "" : String(value);
  return [
    `Name: ${list(location.name ?? location.restaurant_name ?? location.activity_name)}`,
    `Type: ${list(location.primary_category ?? location.location_type ?? location.activity_type)}`,
    `Cuisine: ${list(location.cuisine ?? location.cuisine_type)}`,
    `Menu highlights: ${list(location.signature_items)}`,
    `Features: ${list(location.special_features ?? location.tags)}`,
    `Vibes: ${list(location.vibe_tags ?? location.semantic_tags ?? location.best_for_tags)}`,
    `Area: ${[location.neighborhood, location.borough, location.city].filter(Boolean).join(", ")}`,
    `Description: ${list(location.description)}`,
  ].filter((line) => !line.endsWith(": ")).join("\n").slice(0, 6000);
}

function deterministicSplit(key: string) {
  const bucket = parseInt(createHash("sha256").update(key).digest("hex").slice(0, 8), 16) % 100;
  if (bucket < 80) return "train";
  if (bucket < 90) return "validation";
  return "test";
}

export async function GET(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const days = Math.max(7, Math.min(180, Number(new URL(request.url).searchParams.get("days") || 90)));
  const cutoff = new Date(Date.now() - days * 864e5).toISOString();
  const { data: searches, error } = await supabaseAdmin.from("search_events")
    .select("id,raw_query,normalized_query,clicked_result_id,saved_result_id,metadata,default_market_id,city,borough,created_at")
    .gte("created_at", cutoff)
    .not("raw_query", "is", null)
    .order("created_at", { ascending: false })
    .limit(10000);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const draft: Array<{ key: string; query: string; positiveId: string; negativeId: string; weight: number; market: string | null; source: string }> = [];
  for (const row of searches ?? []) {
    const query = String(row.raw_query ?? row.normalized_query ?? "").trim();
    const positiveId = uuid(row.saved_result_id) ?? uuid(row.clicked_result_id);
    if (!query || !positiveId) continue;
    const candidates = displayedIds(row.metadata).filter((id) => id !== positiveId);
    if (!candidates.length) continue;
    const negativeId = candidates[0];
    const key = createHash("sha256").update(`${query.toLowerCase()}\n${positiveId}\n${negativeId}`).digest("hex");
    draft.push({ key, query, positiveId, negativeId, weight: row.saved_result_id ? 1.5 : 1.0, market: row.default_market_id ?? row.city ?? row.borough ?? null, source: row.saved_result_id ? "saved_result" : "clicked_result" });
  }

  const ids = [...new Set(draft.flatMap((row) => [row.positiveId, row.negativeId]))];
  const { data: locations, error: locationError } = ids.length
    ? await supabaseAdmin.from("locations").select("id,name,restaurant_name,activity_name,location_type,primary_category,activity_type,cuisine,cuisine_type,signature_items,special_features,tags,vibe_tags,semantic_tags,best_for_tags,neighborhood,borough,city,description").in("id", ids)
    : { data: [] as any[], error: null };
  if (locationError) return NextResponse.json({ ok: false, error: locationError.message }, { status: 500 });
  const byId = new Map((locations ?? []).map((row: any) => [String(row.id), row]));
  const upserts = draft.flatMap((row) => {
    const positive = byId.get(row.positiveId);
    const negative = byId.get(row.negativeId);
    if (!positive || !negative) return [];
    return [{
      example_key: row.key,
      query: row.query,
      positive_document: trainingDocument(positive),
      negative_document: trainingDocument(negative),
      positive_location_id: row.positiveId,
      negative_location_id: row.negativeId,
      source: row.source,
      signal_weight: row.weight,
      market_key: row.market,
      split: deterministicSplit(row.key),
      review_status: "approved",
      metadata: { pii: false, source_window_days: days },
      updated_at: new Date().toISOString(),
    }];
  });
  if (upserts.length) {
    const { error: upsertError } = await supabaseAdmin.from("search_reranker_training_examples").upsert(upserts, { onConflict: "example_key" });
    if (upsertError) return NextResponse.json({ ok: false, error: upsertError.message }, { status: 500 });
  }
  const { data: counts } = await supabaseAdmin.from("search_reranker_training_examples").select("split").eq("review_status", "approved").limit(20000);
  const splitCounts = (counts ?? []).reduce((acc: Record<string, number>, row: any) => { acc[row.split] = (acc[row.split] ?? 0) + 1; return acc; }, {});
  return NextResponse.json({ ok: true, scannedSearches: searches?.length ?? 0, candidates: draft.length, upserted: upserts.length, splitCounts, minimumTrainingExamples: 500 });
}
