import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildLocationSemanticDocument } from "@/lib/search/enterprise/semantic";
import { classifySearchLocation } from "@/lib/search/enterprise/classification";
import {
  fetchHuggingFaceEmbedding,
  hfEmbeddingModel,
  hfEmbeddingVersion,
  hfSemanticShadowEnabled,
  HF_EMBEDDING_PROVIDER,
} from "@/lib/search/huggingFaceEmbedding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return request.headers.get("authorization") === `Bearer ${expected}`;
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

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!hfSemanticShadowEnabled()) {
    return NextResponse.json({ ok: true, skipped: true, reason: "SEARCH_HF_SEMANTIC_SHADOW_ENABLED=false" });
  }

  const startedAt = new Date().toISOString();
  const model = hfEmbeddingModel();
  const version = hfEmbeddingVersion();
  const batchSize = Math.max(1, Math.min(250, Number(process.env.SEARCH_HF_EMBEDDING_BATCH_SIZE || 25)));
  const { data: queueRows, error: queueError } = await supabaseAdmin.rpc("get_hf_search_embedding_backfill_candidates", { p_limit: batchSize });
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
          .select("location_id,semantic_document_hash,embedding_version,status")
          .in("location_id", locationIds),
      ])
    : [{ data: [] as any[] }, { data: [] as any[] }];

  const reviewByLocation = new Map((reviewRows ?? []).map((row: any) => [String(row.location_id), row]));
  const embeddingByLocation = new Map((existingRows ?? []).map((row: any) => [String(row.location_id), row]));
  let updated = 0;
  let unchanged = 0;
  const failures: Array<{ locationId: string; error: string }> = [];

  for (const location of rows ?? []) {
    try {
      const enrichedLocation = enrichedForSemantic(location, reviewByLocation.get(String(location.id)));
      const document = buildLocationSemanticDocument(enrichedLocation as any);
      if (!document.eligibleForPublicEmbedding) continue;
      const classification = classifySearchLocation(enrichedLocation as any);
      if (classification.canonicalType === "unsupported" || classification.canonicalType === "nightlife") continue;

      const existing = embeddingByLocation.get(String(location.id));
      if (
        existing?.status === "ready" &&
        existing?.embedding_version === version &&
        existing?.semantic_document_hash === document.semanticDocumentHash
      ) {
        unchanged += 1;
        continue;
      }

      const embedding = await fetchHuggingFaceEmbedding(document.semanticDocument);
      const { error: upsertError } = await supabaseAdmin.from("location_search_embeddings_hf").upsert({
        location_id: location.id,
        embedding,
        canonical_search_type: classification.canonicalType,
        market_key: location.market ?? location.default_market_id ?? null,
        embedding_provider: HF_EMBEDDING_PROVIDER,
        embedding_model: model,
        embedding_version: version,
        semantic_document_hash: document.semanticDocumentHash,
        semantic_document_version: document.semanticDocumentVersion,
        status: "ready",
        calculated_at: new Date().toISOString(),
        error_message: null,
      }, { onConflict: "location_id" });
      if (upsertError) throw upsertError;
      updated += 1;
    } catch (caught) {
      failures.push({ locationId: String(location.id), error: caught instanceof Error ? caught.message : "unknown_error" });
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
    shadowOnly: true,
    embeddings: {
      queued: queuedLocationIds.length,
      scanned: rows?.length ?? 0,
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
