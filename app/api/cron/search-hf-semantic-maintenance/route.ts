import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildLocationSemanticDocument } from "@/lib/search/enterprise/semantic";
import { classifySearchLocation } from "@/lib/search/enterprise/classification";
import {
  fetchHuggingFaceEmbeddings,
  resolveSearchMlRuntimeConfig,
  HF_EMBEDDING_PROVIDER,
} from "@/lib/search/huggingFaceEmbedding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const HF_FOOD_DOCUMENT_VERSION = "hf-food-document:v1";

async function authorized(request: Request) {
  const provided = request.headers.get("authorization");
  const cronSecret = String(process.env.CRON_SECRET || "").trim();
  if (cronSecret && provided === `Bearer ${cronSecret}`) return true;
  const runtimeConfig = await resolveSearchMlRuntimeConfig().catch(() => null);
  return Boolean(runtimeConfig?.token && provided === `Bearer ${runtimeConfig.token}`);
}

function uniq(values: unknown[]) {
  return [...new Set(values.flatMap((value) => Array.isArray(value) ? value : value == null ? [] : [value]).map(String).map((value) => value.trim()).filter(Boolean))];
}

function reviewVibes(review: any) {
  const vibes: string[] = [];
  if (Number(review?.romantic_score ?? 0) >= 55) vibes.push("romantic");
  if (Number(review?.quiet_score ?? 0) >= 55) vibes.push("quiet", "conversation_friendly");
  if (Number(review?.relaxed_score ?? 0) >= 55) vibes.push("relaxed");
  if (Number(review?.lively_score ?? 0) >= 55) vibes.push("lively");
  if (Number(review?.photo_worthy_score ?? 0) >= 55) vibes.push("photo_worthy");
  return uniq(vibes);
}

function enrichedForSemantic(location: any, review: any) {
  return {
    ...location,
    vibe_tags: uniq([location.vibe_tags, location.semantic_tags, reviewVibes(review)]),
    best_for_tags: uniq([location.best_for_tags, review?.best_for_terms]),
    review_themes: uniq([
      review?.best_for_terms,
      Number(review?.noise_penalty ?? 0) >= 45 ? ["can_be_loud"] : [],
      Number(review?.service_penalty ?? 0) >= 45 ? ["service_consistency_concern"] : [],
      Number(review?.overpriced_penalty ?? 0) >= 45 ? ["value_concern"] : [],
    ]),
  };
}

function buildFoodDocument(location: any) {
  const foods = uniq([
    location.foods,
    location.signature_items,
    location.menu_highlights,
    location.menu_items,
    location.cuisines,
    location.cuisine,
    location.cuisine_type,
    location.restaurant_categories,
  ]);
  if (!foods.length) return null;
  const text = [
    `Restaurant: ${String(location.name ?? location.restaurant_name ?? "")}`,
    `Cuisine and food: ${foods.join(", ")}`,
  ].filter(Boolean).join("\n");
  return {
    text,
    hash: createHash("sha256").update(`${HF_FOOD_DOCUMENT_VERSION}\n${text}`).digest("hex"),
    version: HF_FOOD_DOCUMENT_VERSION,
  };
}

export async function GET(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const runtimeConfig = await resolveSearchMlRuntimeConfig();
  if (runtimeConfig.semanticMode === "disabled") {
    return NextResponse.json({ ok: true, skipped: true, reason: "SEARCH_HF_SEMANTIC_MODE=disabled" });
  }

  const startedAt = new Date().toISOString();
  const model = runtimeConfig.embeddingModel;
  const version = runtimeConfig.embeddingVersion;
  const batchSize = Math.max(1, Math.min(100, Number(process.env.SEARCH_HF_EMBEDDING_BATCH_SIZE || 40)));
  const { data: queueRows, error: queueError } = await supabaseAdmin.rpc("get_hf_search_embedding_backfill_candidates", {
    p_limit: batchSize,
    p_embedding_version: version,
  });
  if (queueError) return NextResponse.json({ ok: false, error: queueError.message }, { status: 500 });

  const queuedLocationIds = (queueRows ?? []).map((row: any) => row.location_id).filter(Boolean);
  const { data: rows, error } = queuedLocationIds.length
    ? await supabaseAdmin.from("locations").select("*").in("id", queuedLocationIds)
    : { data: [] as any[], error: null };
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const locationIds = (rows ?? []).map((row: any) => row.id).filter(Boolean);
  const [{ data: reviewRows }, { data: existingRows }] = locationIds.length
    ? await Promise.all([
        supabaseAdmin
          .from("location_review_ml_features")
          .select("location_id,romantic_score,quiet_score,relaxed_score,lively_score,photo_worthy_score,noise_penalty,service_penalty,overpriced_penalty,best_for_terms")
          .in("location_id", locationIds),
        supabaseAdmin
          .from("location_search_embeddings_hf")
          .select("location_id,semantic_document_hash,food_document_hash,embedding_version,status")
          .in("location_id", locationIds),
      ])
    : [{ data: [] as any[] }, { data: [] as any[] }];

  const reviewByLocation = new Map((reviewRows ?? []).map((row: any) => [String(row.location_id), row]));
  const embeddingByLocation = new Map((existingRows ?? []).map((row: any) => [String(row.location_id), row]));
  const prepared: Array<{ location: any; document: any; foodDocument: ReturnType<typeof buildFoodDocument>; classification: any }> = [];
  let unchanged = 0;

  for (const location of rows ?? []) {
    const enrichedLocation = enrichedForSemantic(location, reviewByLocation.get(String(location.id)));
    const document = buildLocationSemanticDocument(enrichedLocation as any);
    if (!document.eligibleForPublicEmbedding) continue;
    const classification = classifySearchLocation(enrichedLocation as any);
    if (classification.canonicalType === "unsupported" || classification.canonicalType === "nightlife") continue;
    const foodDocument = classification.canonicalType === "restaurant" ? buildFoodDocument(enrichedLocation) : null;
    const existing = embeddingByLocation.get(String(location.id));
    if (
      existing?.status === "ready" &&
      existing?.embedding_version === version &&
      existing?.semantic_document_hash === document.semanticDocumentHash &&
      (foodDocument ? existing?.food_document_hash === foodDocument.hash : !existing?.food_document_hash)
    ) {
      unchanged += 1;
      continue;
    }
    prepared.push({ location, document, foodDocument, classification });
  }

  const inputSlots: Array<{ preparedIndex: number; kind: "general" | "food" }> = [];
  const inputs: string[] = [];
  prepared.forEach((item, preparedIndex) => {
    inputSlots.push({ preparedIndex, kind: "general" });
    inputs.push(item.document.semanticDocument);
    if (item.foodDocument) {
      inputSlots.push({ preparedIndex, kind: "food" });
      inputs.push(item.foodDocument.text);
    }
  });

  const generalEmbeddingByPrepared = new Map<number, number[]>();
  const foodEmbeddingByPrepared = new Map<number, number[]>();
  const failures: Array<{ locationId: string; error: string }> = [];
  let updated = 0;

  try {
    if (inputs.length) {
      const embeddings = await fetchHuggingFaceEmbeddings(inputs, { timeoutMs: Number(process.env.SEARCH_HF_BACKFILL_TIMEOUT_MS || 20_000) });
      embeddings.forEach((embedding, index) => {
        const slot = inputSlots[index];
        if (!slot) return;
        if (slot.kind === "general") generalEmbeddingByPrepared.set(slot.preparedIndex, embedding);
        else foodEmbeddingByPrepared.set(slot.preparedIndex, embedding);
      });
    }
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "batch_embedding_failed";
    prepared.forEach((item) => failures.push({ locationId: String(item.location.id), error: message }));
  }

  if (!failures.length) {
    for (let index = 0; index < prepared.length; index += 1) {
      const item = prepared[index];
      try {
        const embedding = generalEmbeddingByPrepared.get(index);
        const foodEmbedding = item.foodDocument ? foodEmbeddingByPrepared.get(index) : null;
        if (!embedding) throw new Error("general embedding missing");
        if (item.foodDocument && !foodEmbedding) throw new Error("food embedding missing");
        const { error: upsertError } = await supabaseAdmin.from("location_search_embeddings_hf").upsert({
          location_id: item.location.id,
          embedding,
          food_embedding: foodEmbedding,
          canonical_search_type: item.classification.canonicalType,
          market_key: item.location.market ?? item.location.default_market_id ?? null,
          embedding_provider: HF_EMBEDDING_PROVIDER,
          embedding_model: model,
          embedding_version: version,
          semantic_document_hash: item.document.semanticDocumentHash,
          semantic_document_version: item.document.semanticDocumentVersion,
          food_document_hash: item.foodDocument?.hash ?? null,
          food_document_version: item.foodDocument?.version ?? null,
          status: "ready",
          calculated_at: new Date().toISOString(),
          error_message: null,
        }, { onConflict: "location_id" });
        if (upsertError) throw upsertError;
        updated += 1;
      } catch (caught) {
        failures.push({ locationId: String(item.location.id), error: caught instanceof Error ? caught.message : "unknown_error" });
      }
    }
  }

  const [{ count: searchableCount }, { count: readyEmbeddingCount }] = await Promise.all([
    supabaseAdmin.from("locations").select("id", { count: "exact", head: true }).eq("is_searchable", true).eq("is_hidden", false).eq("active", true).is("deleted_at", null),
    supabaseAdmin.from("location_search_embeddings_hf").select("location_id", { count: "exact", head: true }).eq("status", "ready").eq("embedding_version", version),
  ]);

  await supabaseAdmin.from("hf_search_embedding_runs").insert({
    status: failures.length ? "completed_with_errors" : "completed",
    embedding_provider: HF_EMBEDDING_PROVIDER,
    embedding_model: model,
    embedding_version: version,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    records_scanned: rows?.length ?? 0,
    records_updated: updated,
    records_unchanged: unchanged,
    records_failed: failures.length,
    errors: failures.slice(0, 20),
  });

  return NextResponse.json({
    ok: true,
    provider: HF_EMBEDDING_PROVIDER,
    model,
    version,
    mode: runtimeConfig.semanticMode,
    shadowOnly: runtimeConfig.semanticMode !== "enabled",
    embeddings: {
      queued: queuedLocationIds.length,
      scanned: rows?.length ?? 0,
      prepared: prepared.length,
      updated,
      unchanged,
      failed: failures.length,
      ready: readyEmbeddingCount ?? 0,
      searchable: searchableCount ?? 0,
      remainingApprox: Math.max(0, Number(searchableCount ?? 0) - Number(readyEmbeddingCount ?? 0)),
      failures: failures.slice(0, 10),
    },
  });
}
