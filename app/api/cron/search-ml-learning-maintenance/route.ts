import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  fetchHuggingFaceEmbeddings,
  fetchHuggingFaceTextClassification,
  resolveSearchMlRuntimeConfig,
} from "@/lib/search/huggingFaceEmbedding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const TAG_LABELS = [
  "romantic", "upscale", "casual", "date night", "rooftop", "sports watching",
  "hookah", "live music", "good for groups", "late night", "family friendly",
  "outdoor patio", "intimate", "lively", "quiet", "cocktails", "scenic views",
];

async function authorized(request: Request) {
  const provided = request.headers.get("authorization");
  const cronSecret = String(process.env.CRON_SECRET || "").trim();
  if (cronSecret && provided === `Bearer ${cronSecret}`) return true;
  const config = await resolveSearchMlRuntimeConfig().catch(() => null);
  return Boolean(config?.token && provided === `Bearer ${config.token}`);
}

function locationDocument(row: any) {
  return [row.name, row.location_type, row.description, row.cuisine, ...(row.cuisines ?? []), ...(row.features ?? []), ...(row.signature_items ?? [])]
    .flat().filter(Boolean).map(String).join(" | ").slice(0, 5000);
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

async function ingestLearningEvents() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [{ data: analytics }, { data: negatives }, { data: outings }] = await Promise.all([
    supabaseAdmin.from("analytics_events").select("id,event_name,user_id,session_id,search_id,location_id,restaurant_location_id,activity_location_id,normalized_query,result_type,created_at").gte("created_at", cutoff).in("event_name", ["location_clicked", "result_clicked", "location_saved", "result_saved"]).limit(1000),
    supabaseAdmin.from("search_negative_feedback").select("id,user_id,session_id,search_id,raw_query,normalized_query,location_id,restaurant_location_id,activity_location_id,feedback_type,result_type,result_position,created_at").gte("created_at", cutoff).limit(500),
    supabaseAdmin.from("user_outings").select("id,user_id,status,plan_payload,booked_at,completed_at,created_at").gte("created_at", cutoff).in("status", ["booked", "confirmed", "completed"]).limit(500),
  ]);
  const rows: any[] = [];
  for (const row of analytics ?? []) {
    const saved = String(row.event_name).includes("saved");
    rows.push({ source_key: `analytics:${row.id}`, event_type: row.event_name, signal_value: saved ? 0.55 : 0.25, user_id: row.user_id, session_id: row.session_id, search_id: row.search_id ? String(row.search_id) : null, normalized_query: row.normalized_query, location_id: row.location_id, restaurant_location_id: row.restaurant_location_id, activity_location_id: row.activity_location_id, result_type: row.result_type, metadata: { source: "analytics_events" }, created_at: row.created_at });
  }
  for (const row of negatives ?? []) {
    rows.push({ source_key: `feedback:${row.id}`, event_type: `negative_feedback:${row.feedback_type ?? "other"}`, signal_value: -1, user_id: row.user_id, session_id: row.session_id, search_id: row.search_id, raw_query: row.raw_query, normalized_query: row.normalized_query, location_id: row.location_id, restaurant_location_id: row.restaurant_location_id, activity_location_id: row.activity_location_id, result_type: row.result_type, result_position: row.result_position, metadata: { source: "search_negative_feedback" }, created_at: row.created_at });
  }
  for (const row of outings ?? []) {
    const completed = row.status === "completed" || Boolean(row.completed_at);
    rows.push({ source_key: `outing:${row.id}:${completed ? "completed" : "booked"}`, event_type: completed ? "outing_completed" : "outing_booked", signal_value: completed ? 1 : 0.8, user_id: row.user_id, search_plan: row.plan_payload ?? null, metadata: { source: "user_outings", outing_id: row.id }, created_at: row.completed_at ?? row.booked_at ?? row.created_at });
  }
  if (!rows.length) return 0;
  const { error } = await supabaseAdmin.from("search_ml_learning_events").upsert(rows, { onConflict: "source_key", ignoreDuplicates: true });
  if (error) throw error;
  return rows.length;
}

async function backfillMenu(version: string, model: string) {
  const { data, error } = await supabaseAdmin.rpc("get_hf_menu_embedding_backfill_candidates", { p_limit: 120, p_embedding_version: version });
  if (error) throw error;
  const rows = (data ?? []) as any[];
  if (!rows.length) return 0;
  const vectors = await fetchHuggingFaceEmbeddings(rows.map((row) => row.item_name), { timeoutMs: 20_000 });
  const upserts = rows.map((row, index) => ({ location_id: row.location_id, item_name: row.item_name, normalized_item_name: String(row.item_name).toLowerCase().replace(/\s+/g, " ").trim(), source: row.source, embedding: vectors[index], embedding_model: model, embedding_version: version, status: "ready", calculated_at: new Date().toISOString(), error_message: null }));
  const { error: upsertError } = await supabaseAdmin.from("location_menu_item_embeddings_hf").upsert(upserts, { onConflict: "location_id,normalized_item_name" });
  if (upsertError) throw upsertError;
  return upserts.length;
}

async function backfillLocationTags(model: string) {
  const batchSize = boundedInteger(process.env.SEARCH_HF_TAG_LOCATION_BATCH_SIZE, 12, 1, 40);
  const rotationMinutes = boundedInteger(process.env.SEARCH_HF_TAG_ROTATION_MINUTES, 15, 1, 1440);
  const { count, error: countError } = await supabaseAdmin.from("locations")
    .select("id", { count: "exact", head: true })
    .eq("is_searchable", true).eq("is_hidden", false).eq("active", true).is("deleted_at", null);
  if (countError) throw countError;
  const searchableCount = count ?? 0;
  if (!searchableCount) return { updated: 0, scanned: 0, pageIndex: 0, pageCount: 0 };

  const pageCount = Math.max(1, Math.ceil(searchableCount / batchSize));
  const pageIndex = Math.floor(Date.now() / (rotationMinutes * 60_000)) % pageCount;
  const offset = pageIndex * batchSize;
  const end = Math.min(searchableCount - 1, offset + batchSize - 1);
  const { data: rows, error } = await supabaseAdmin.from("locations")
    .select("id,name,location_type,description,cuisine,cuisines,features,signature_items,updated_at")
    .eq("is_searchable", true).eq("is_hidden", false).eq("active", true).is("deleted_at", null)
    .order("id", { ascending: true }).range(offset, end);
  if (error) throw error;

  let updated = 0;
  let unchanged = 0;
  for (const row of rows ?? []) {
    const doc = locationDocument(row);
    if (!doc) continue;
    const hash = createHash("sha256").update(doc).digest("hex");
    const { data: existing } = await supabaseAdmin.from("location_ml_attributes").select("document_hash").eq("location_id", row.id).maybeSingle();
    if (existing?.document_hash === hash) {
      unchanged += 1;
      continue;
    }
    const scores = await fetchHuggingFaceTextClassification(doc, TAG_LABELS, { timeoutMs: 2500, minScore: 0.66 });
    const tagScores = Object.fromEntries(scores.map((score) => [score.label, score.score]));
    const selected = scores.filter((score) => score.score >= 0.72).map((score) => score.label);
    const vibes = selected.filter((tag) => ["romantic", "upscale", "casual", "intimate", "lively", "quiet", "date night"].includes(tag));
    const features = selected.filter((tag) => !vibes.includes(tag));
    const { error: upsertError } = await supabaseAdmin.from("location_ml_attributes").upsert({
      location_id: row.id,
      vibes,
      features,
      occasions: selected.includes("date night") ? ["date night"] : [],
      audiences: selected.includes("good for groups") ? ["groups"] : selected.includes("family friendly") ? ["family"] : [],
      tag_scores: tagScores,
      model,
      model_version: `${model}:tags-v1`,
      document_hash: hash,
      confidence: scores[0]?.score ?? 0,
      status: "ready",
      calculated_at: new Date().toISOString(),
      error_message: null,
    }, { onConflict: "location_id" });
    if (upsertError) throw upsertError;
    updated += 1;
  }
  return { updated, unchanged, scanned: rows?.length ?? 0, pageIndex, pageCount, searchableCount };
}

async function backfillPersonalization(version: string, model: string) {
  const { data: users, error } = await supabaseAdmin.rpc("get_search_personalization_backfill_users", { p_limit: 15 });
  if (error) throw error;
  let updated = 0;
  for (const user of users ?? []) {
    const { data: signals } = await supabaseAdmin.from("search_ml_learning_events").select("location_id,restaurant_location_id,activity_location_id,signal_value,event_type").eq("user_id", user.user_id).gt("signal_value", 0).order("created_at", { ascending: false }).limit(80);
    const weightedIds: string[] = [];
    for (const signal of signals ?? []) {
      const id = signal.location_id ?? signal.restaurant_location_id ?? signal.activity_location_id;
      if (!id) continue;
      const repeats = Math.max(1, Math.min(4, Math.round(Number(signal.signal_value ?? 0.25) * 4)));
      for (let i = 0; i < repeats; i += 1) weightedIds.push(String(id));
    }
    const ids = [...new Set(weightedIds)];
    if (!ids.length) continue;
    const { data: locations } = await supabaseAdmin.from("locations").select("id,name,location_type,description,cuisine,cuisines,features,signature_items").in("id", ids);
    const byId = new Map((locations ?? []).map((row: any) => [String(row.id), row]));
    const document = weightedIds.map((id) => byId.get(id)).filter(Boolean).map(locationDocument).join("\n").slice(0, 10000);
    if (!document) continue;
    const [embedding] = await fetchHuggingFaceEmbeddings([document], { timeoutMs: 5000 });
    const { error: upsertError } = await supabaseAdmin.from("user_search_preference_vectors").upsert({
      user_id: user.user_id,
      embedding,
      profile: { positive_location_ids: ids.slice(0, 30) },
      evidence_count: weightedIds.length,
      embedding_model: model,
      embedding_version: version,
      status: "ready",
      calculated_at: new Date().toISOString(),
      error_message: null,
    }, { onConflict: "user_id" });
    if (upsertError) throw upsertError;
    updated += 1;
  }
  return updated;
}

export async function GET(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const config = await resolveSearchMlRuntimeConfig();
  const result: Record<string, unknown> = { ok: true, modes: { learning: config.learningMode, menu: config.menuMode, tags: config.locationTagMode, personalization: config.personalizationMode } };
  try {
    if (config.learningMode !== "disabled") result.learningEventsProcessed = await ingestLearningEvents();
    if (config.menuMode !== "disabled") result.menuItemsEmbedded = await backfillMenu(config.embeddingVersion, config.embeddingModel);
    if (config.locationTagMode !== "disabled") result.locationTagging = await backfillLocationTags(config.embeddingModel);
    if (config.personalizationMode !== "disabled") result.preferenceVectorsUpdated = await backfillPersonalization(config.embeddingVersion, config.embeddingModel);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ ...result, ok: false, error: error instanceof Error ? error.message : "search_ml_maintenance_failed" }, { status: 500 });
  }
}
