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

const LOCATION_ML_SELECT = [
  "id", "name", "restaurant_name", "activity_name", "location_type", "description", "short_description",
  "cuisine", "cuisine_type", "special_features", "tags", "vibe_tags", "best_for_tags", "signature_items", "updated_at",
].join(",");

async function authorized(request: Request) {
  const provided = request.headers.get("authorization");
  const cronSecret = String(process.env.CRON_SECRET || "").trim();
  if (cronSecret && provided === `Bearer ${cronSecret}`) return true;
  const config = await resolveSearchMlRuntimeConfig().catch(() => null);
  return Boolean(config?.token && provided === `Bearer ${config.token}`);
}

function values(value: unknown) {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function locationDocument(row: any) {
  return [
    row.name,
    row.restaurant_name,
    row.activity_name,
    row.location_type,
    row.description,
    row.short_description,
    row.cuisine,
    row.cuisine_type,
    ...values(row.special_features),
    ...values(row.tags),
    ...values(row.vibe_tags),
    ...values(row.best_for_tags),
    ...values(row.signature_items),
  ].flat().filter(Boolean).map(String).join(" | ").slice(0, 5000);
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

async function ingestLearningEvents() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [analyticsResult, negativesResult, outingsResult] = await Promise.all([
    supabaseAdmin.from("analytics_events")
      .select("id,event_name,user_id,session_id,search_id,location_id,restaurant_location_id,activity_location_id,normalized_query,result_type,created_at")
      .gte("created_at", cutoff)
      .in("event_name", ["location_clicked", "result_clicked", "location_saved", "result_saved"])
      .limit(1000),
    supabaseAdmin.from("search_negative_feedback")
      .select("id,user_id,session_id,search_id,raw_query,normalized_query,location_id,restaurant_location_id,activity_location_id,feedback_type,result_type,result_position,created_at")
      .gte("created_at", cutoff)
      .limit(500),
    supabaseAdmin.from("user_outings")
      .select("id,user_id,status,restaurant_id,activity_id,plan_payload,booked_at,completed_at,created_at")
      .gte("created_at", cutoff)
      .in("status", ["booked", "confirmed", "completed"])
      .limit(500),
  ]);

  if (analyticsResult.error) throw new Error(`learning_analytics:${analyticsResult.error.message}`);
  if (negativesResult.error) throw new Error(`learning_feedback:${negativesResult.error.message}`);
  if (outingsResult.error) throw new Error(`learning_outings:${outingsResult.error.message}`);

  const rows: any[] = [];
  for (const row of analyticsResult.data ?? []) {
    const saved = String(row.event_name).includes("saved");
    rows.push({
      source_key: `analytics:${row.id}`,
      event_type: row.event_name,
      signal_value: saved ? 0.55 : 0.25,
      user_id: row.user_id,
      session_id: row.session_id,
      search_id: row.search_id ? String(row.search_id) : null,
      normalized_query: row.normalized_query,
      location_id: row.location_id,
      restaurant_location_id: row.restaurant_location_id,
      activity_location_id: row.activity_location_id,
      result_type: row.result_type,
      metadata: { source: "analytics_events" },
      created_at: row.created_at,
    });
  }
  for (const row of negativesResult.data ?? []) {
    rows.push({
      source_key: `feedback:${row.id}`,
      event_type: `negative_feedback:${row.feedback_type ?? "other"}`,
      signal_value: -1,
      user_id: row.user_id,
      session_id: row.session_id,
      search_id: row.search_id,
      raw_query: row.raw_query,
      normalized_query: row.normalized_query,
      location_id: row.location_id,
      restaurant_location_id: row.restaurant_location_id,
      activity_location_id: row.activity_location_id,
      result_type: row.result_type,
      result_position: row.result_position,
      metadata: { source: "search_negative_feedback" },
      created_at: row.created_at,
    });
  }
  for (const row of outingsResult.data ?? []) {
    const completed = row.status === "completed" || Boolean(row.completed_at);
    rows.push({
      source_key: `outing:${row.id}:${completed ? "completed" : "booked"}`,
      event_type: completed ? "outing_completed" : "outing_booked",
      signal_value: completed ? 1 : 0.8,
      user_id: row.user_id,
      restaurant_location_id: row.restaurant_id,
      activity_location_id: row.activity_id,
      search_plan: row.plan_payload ?? null,
      metadata: { source: "user_outings", outing_id: row.id },
      created_at: row.completed_at ?? row.booked_at ?? row.created_at,
    });
  }
  if (!rows.length) return 0;
  const { error } = await supabaseAdmin.from("search_ml_learning_events")
    .upsert(rows, { onConflict: "source_key", ignoreDuplicates: true });
  if (error) throw error;
  return rows.length;
}

async function backfillMenu(version: string, model: string) {
  const { data, error } = await supabaseAdmin.rpc("get_hf_menu_embedding_backfill_candidates", {
    p_limit: 120,
    p_embedding_version: version,
  });
  if (error) throw error;
  const rows = (data ?? []) as any[];
  if (!rows.length) return 0;
  const vectors = await fetchHuggingFaceEmbeddings(rows.map((row) => row.item_name), { timeoutMs: 20_000 });
  const upserts = rows.map((row, index) => ({
    location_id: row.location_id,
    item_name: row.item_name,
    normalized_item_name: String(row.item_name).toLowerCase().replace(/\s+/g, " ").trim(),
    source: row.source,
    embedding: vectors[index],
    embedding_model: model,
    embedding_version: version,
    status: "ready",
    calculated_at: new Date().toISOString(),
    error_message: null,
  }));
  const { error: upsertError } = await supabaseAdmin.from("location_menu_item_embeddings_hf")
    .upsert(upserts, { onConflict: "location_id,normalized_item_name" });
  if (upsertError) throw upsertError;
  return upserts.length;
}

async function backfillLocationTags(model: string) {
  const batchSize = boundedInteger(process.env.SEARCH_HF_TAG_LOCATION_BATCH_SIZE, 24, 1, 40);
  const { count, error: countError } = await supabaseAdmin.from("locations")
    .select("id", { count: "exact", head: true })
    .eq("is_searchable", true).eq("is_hidden", false).eq("active", true).is("deleted_at", null);
  if (countError) throw countError;
  const searchableCount = count ?? 0;
  if (!searchableCount) return { updated: 0, scanned: 0, searchableCount: 0 };

  const { data: existingRows, error: existingError } = await supabaseAdmin.from("location_ml_attributes")
    .select("location_id,document_hash,status,calculated_at")
    .order("calculated_at", { ascending: true })
    .limit(Math.min(searchableCount, 5000));
  if (existingError) throw existingError;
  const existing = new Map((existingRows ?? []).map((row: any) => [String(row.location_id), row]));

  const { data: locationRows, error } = await supabaseAdmin.from("locations")
    .select(LOCATION_ML_SELECT)
    .eq("is_searchable", true).eq("is_hidden", false).eq("active", true).is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(Math.min(searchableCount, 5000));
  if (error) throw error;

  const prepared = (locationRows ?? []).map((row: any) => {
    const doc = locationDocument(row);
    const hash = doc ? createHash("sha256").update(doc).digest("hex") : "";
    const prior = existing.get(String(row.id));
    const needsUpdate = Boolean(doc) && (!prior || prior.status !== "ready" || prior.document_hash !== hash);
    return { row, doc, hash, needsUpdate, priorAt: prior?.calculated_at ?? null };
  }).filter((item) => item.needsUpdate)
    .sort((a, b) => String(a.priorAt ?? "").localeCompare(String(b.priorAt ?? "")))
    .slice(0, batchSize);

  let updated = 0;
  let failed = 0;
  for (const item of prepared) {
    try {
      const scores = await fetchHuggingFaceTextClassification(item.doc, TAG_LABELS, { timeoutMs: 2500, minScore: 0.66 });
      const tagScores = Object.fromEntries(scores.map((score) => [score.label, score.score]));
      const selected = scores.filter((score) => score.score >= 0.72).map((score) => score.label);
      const vibes = selected.filter((tag) => ["romantic", "upscale", "casual", "intimate", "lively", "quiet", "date night"].includes(tag));
      const features = selected.filter((tag) => !vibes.includes(tag));
      const { error: upsertError } = await supabaseAdmin.from("location_ml_attributes").upsert({
        location_id: item.row.id,
        vibes,
        features,
        occasions: selected.includes("date night") ? ["date night"] : [],
        audiences: selected.includes("good for groups") ? ["groups"] : selected.includes("family friendly") ? ["family"] : [],
        tag_scores: tagScores,
        model,
        model_version: `${model}:tags-v1`,
        document_hash: item.hash,
        confidence: scores[0]?.score ?? 0,
        status: "ready",
        calculated_at: new Date().toISOString(),
        error_message: null,
      }, { onConflict: "location_id" });
      if (upsertError) throw upsertError;
      updated += 1;
    } catch (caught) {
      failed += 1;
      await supabaseAdmin.from("location_ml_attributes").upsert({
        location_id: item.row.id,
        vibes: [], features: [], occasions: [], audiences: [], tag_scores: {},
        model, model_version: `${model}:tags-v1`, document_hash: item.hash,
        confidence: 0, status: "failed", calculated_at: new Date().toISOString(),
        error_message: caught instanceof Error ? caught.message : "location_tagging_failed",
      }, { onConflict: "location_id" });
    }
  }
  return { updated, failed, scanned: prepared.length, searchableCount, remainingEstimate: Math.max(0, searchableCount - existing.size - updated) };
}

async function backfillPersonalization(version: string, model: string) {
  const { data: users, error } = await supabaseAdmin.rpc("get_search_personalization_backfill_users", { p_limit: 15 });
  if (error) throw error;
  let updated = 0;
  for (const user of users ?? []) {
    const { data: signals, error: signalError } = await supabaseAdmin.from("search_ml_learning_events")
      .select("location_id,restaurant_location_id,activity_location_id,signal_value,event_type")
      .eq("user_id", user.user_id)
      .gt("signal_value", 0)
      .order("created_at", { ascending: false })
      .limit(80);
    if (signalError) throw signalError;
    const weightedIds: string[] = [];
    for (const signal of signals ?? []) {
      const id = signal.location_id ?? signal.restaurant_location_id ?? signal.activity_location_id;
      if (!id) continue;
      const repeats = Math.max(1, Math.min(4, Math.round(Number(signal.signal_value ?? 0.25) * 4)));
      for (let i = 0; i < repeats; i += 1) weightedIds.push(String(id));
    }
    const ids = [...new Set(weightedIds)];
    if (!ids.length) continue;
    const { data: locations, error: locationsError } = await supabaseAdmin.from("locations")
      .select(LOCATION_ML_SELECT)
      .in("id", ids);
    if (locationsError) throw locationsError;
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

type StepResult = { enabled: boolean; ok: boolean; value?: unknown; error?: string };

async function runStep(enabled: boolean, fn: () => Promise<unknown>): Promise<StepResult> {
  if (!enabled) return { enabled: false, ok: true };
  try {
    return { enabled: true, ok: true, value: await fn() };
  } catch (error) {
    return { enabled: true, ok: false, error: error instanceof Error ? error.message : "unknown_maintenance_error" };
  }
}

export async function GET(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const config = await resolveSearchMlRuntimeConfig();
  const steps = {
    learning: await runStep(config.learningMode !== "disabled", () => ingestLearningEvents()),
    menu: await runStep(config.menuMode !== "disabled", () => backfillMenu(config.embeddingVersion, config.embeddingModel)),
    tags: await runStep(config.locationTagMode !== "disabled", () => backfillLocationTags(config.embeddingModel)),
    personalization: await runStep(config.personalizationMode !== "disabled", () => backfillPersonalization(config.embeddingVersion, config.embeddingModel)),
  };
  const enabledSteps = Object.values(steps).filter((step) => step.enabled);
  const failures = Object.entries(steps).filter(([, step]) => step.enabled && !step.ok).map(([name, step]) => ({ name, error: step.error }));
  const successes = enabledSteps.filter((step) => step.ok).length;
  const ok = failures.length === 0 || successes > 0;
  return NextResponse.json({
    ok,
    degraded: failures.length > 0,
    modes: {
      learning: config.learningMode,
      menu: config.menuMode,
      tags: config.locationTagMode,
      personalization: config.personalizationMode,
    },
    steps,
    failures,
  }, { status: ok ? 200 : 500 });
}
