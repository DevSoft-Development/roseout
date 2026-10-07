import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildLocationSemanticDocument, EMBEDDING_MODEL, EMBEDDING_VERSION, isEligibleForPublicEmbedding } from "@/lib/search/enterprise/semantic";
import { classifySearchLocation } from "@/lib/search/enterprise/classification";
import { AzureQueryEmbeddingProvider } from "@/lib/search/v3/semantic/azureQueryEmbeddingProvider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return request.headers.get("authorization") === `Bearer ${expected}`;
}

const azureEmbeddingProvider = new AzureQueryEmbeddingProvider({ timeoutMs: 30_000 });

async function embed(text: string) {
  const result = await azureEmbeddingProvider.embed(text);
  if (!Array.isArray(result.vector) || !result.vector.length) {
    throw new Error("Azure embedding response was empty");
  }
  return result.vector;
}

const uniq = (values: unknown[]) => [...new Set(values.flatMap((value) => Array.isArray(value) ? value : value == null ? [] : [value]).map(String).map((value) => value.trim()).filter(Boolean))];

function reviewVibes(review: any) {
  const vibes: string[] = [];
  if (Number(review?.romantic_score ?? 0) >= 55) vibes.push("romantic");
  if (Number(review?.quiet_score ?? 0) >= 55) vibes.push("quiet", "conversation_friendly");
  if (Number(review?.relaxed_score ?? 0) >= 55) vibes.push("relaxed");
  if (Number(review?.lively_score ?? 0) >= 55) vibes.push("lively");
  if (Number(review?.photo_worthy_score ?? 0) >= 55) vibes.push("photo_worthy");
  return uniq(vibes);
}

function reviewOccasions(review: any) {
  const occasions: string[] = [];
  if (Number(review?.date_night_score ?? 0) >= 55) occasions.push("date_night");
  if (Number(review?.group_score ?? 0) >= 55) occasions.push("group_outing");
  if (Number(review?.family_score ?? 0) >= 55) occasions.push("family_outing");
  return uniq(occasions);
}

function enrichedForSemantic(location: any, review: any) {
  const vibes = reviewVibes(review);
  const bestFor = uniq([location.best_for_tags, review?.best_for_terms]);
  const reviewThemes = uniq([
    review?.best_for_terms,
    Number(review?.noise_penalty ?? 0) >= 45 ? ["can_be_loud"] : [],
    Number(review?.service_penalty ?? 0) >= 45 ? ["service_consistency_concern"] : [],
    Number(review?.overpriced_penalty ?? 0) >= 45 ? ["value_concern"] : [],
  ]);
  return {
    ...location,
    vibe_tags: uniq([location.vibe_tags, location.semantic_tags, vibes]),
    best_for_tags: bestFor,
    review_themes: reviewThemes,
  };
}

function timestampMs(value: unknown) {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function reviewProfileNeedsSync(review: any, profile: any) {
  if (!profile) return false;
  const evidence =
    profile.evidence && typeof profile.evidence === "object"
      ? profile.evidence.review_intelligence
      : null;
  if (!evidence || typeof evidence !== "object") return true;

  const sourceUpdatedAt = Math.max(
    timestampMs(review?.updated_at),
    timestampMs(review?.calculated_at),
  );
  const syncedAt = timestampMs(evidence.synced_at);
  return sourceUpdatedAt > 0 && sourceUpdatedAt > syncedAt;
}

const CANDIDATE_LOCATION_FIELDS = [
  "id",
  "updated_at",
  "created_at",
  "is_searchable",
  "is_hidden",
  "active",
  "deleted_at",
  "status",
  "data_status",
  "duplicate_status",
  "canonical_search_type",
  "admin_canonical_search_type",
  "location_type",
  "source_entity_type",
  "source_table",
  "type",
  "restaurant_name",
  "cuisine",
  "cuisine_type",
  "activity_name",
  "activity_type",
  "primary_category",
  "category",
  "google_types",
  "tags",
  "vibe_tags",
  "best_for_tags",
  "date_style_tags",
  "search_keywords",
  "semantic_tags",
  "intent_tags",
  "description",
  "search_document",
  "semantic_search_text",
].join(",");

function semanticCandidateEligible(location: any) {
  try {
    if (!isEligibleForPublicEmbedding(location as any).eligible) return false;
    return classifySearchLocation(location as any).canonicalType !== "unsupported";
  } catch {
    return false;
  }
}

async function getEmbeddingBackfillCandidateIds(limit: number) {
  const selected: string[] = [];
  const pageSize = 200;
  const maxRowsToScan = 10_000;

  for (
    let from = 0;
    selected.length < limit && from < maxRowsToScan;
    from += pageSize
  ) {
    const { data: locationRowsRaw, error: locationError } = await supabaseAdmin
      .from("locations")
      .select(CANDIDATE_LOCATION_FIELDS)
      .eq("is_searchable", true)
      .eq("is_hidden", false)
      .eq("active", true)
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (locationError) throw locationError;
    const locationRows = (locationRowsRaw ?? []) as any[];
    if (!locationRows.length) break;

    const ids = locationRows.map((row: any) => row.id).filter(Boolean);
    const { data: embeddingRows, error: embeddingError } = ids.length
      ? await supabaseAdmin
          .from("location_search_embeddings")
          .select("location_id,status,calculated_at")
          .in("location_id", ids)
      : { data: [] as any[], error: null };
    if (embeddingError) throw embeddingError;

    const embeddingByLocation = new Map(
      (embeddingRows ?? []).map((row: any) => [String(row.location_id), row]),
    );

    for (const location of locationRows) {
      const existing = embeddingByLocation.get(String(location.id));
      const sourceUpdatedAt = timestampMs(location.updated_at ?? location.created_at);
      const embeddingUpdatedAt = timestampMs(existing?.calculated_at);
      const needsEmbedding =
        !existing ||
        existing.status !== "ready" ||
        (sourceUpdatedAt > 0 && sourceUpdatedAt > embeddingUpdatedAt);
      if (!needsEmbedding || !semanticCandidateEligible(location)) continue;
      selected.push(String(location.id));
      if (selected.length >= limit) break;
    }

    if (locationRows.length < pageSize) break;
  }

  return selected;
}

async function getReviewPriorityLocationIds(limit: number) {
  const selected: string[] = [];
  // Keep PostgREST .in(...) request URLs bounded. We only need enough
  // candidates to fill the current maintenance batch, so scan in small chunks.
  const pageSize = 100;
  const maxRowsToScan = 10_000;

  for (
    let from = 0;
    selected.length < limit && from < maxRowsToScan;
    from += pageSize
  ) {
    const { data: reviewRows, error: reviewError } = await supabaseAdmin
      .from("location_review_ml_features")
      .select("location_id,updated_at,calculated_at")
      .order("location_id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (reviewError) throw reviewError;
    if (!reviewRows?.length) break;

    const ids = reviewRows.map((row: any) => row.location_id).filter(Boolean);
    const [{ data: profiles, error: profileError }, { data: locations, error: locationError }] = ids.length
      ? await Promise.all([
          supabaseAdmin
            .from("location_search_profiles")
            .select("location_id,evidence")
            .in("location_id", ids),
          supabaseAdmin
            .from("locations")
            .select(CANDIDATE_LOCATION_FIELDS)
            .in("id", ids),
        ])
      : [
          { data: [] as any[], error: null },
          { data: [] as any[], error: null },
        ];
    if (profileError) throw profileError;
    if (locationError) throw locationError;

    const profileByLocation = new Map(
      (profiles ?? []).map((row: any) => [String(row.location_id), row]),
    );
    const locationById = new Map(
      (locations ?? []).map((row: any) => [String(row.id), row]),
    );

    for (const review of reviewRows) {
      const locationId = String(review.location_id ?? "");
      if (!locationId) continue;
      const profile = profileByLocation.get(locationId);
      const location = locationById.get(locationId);
      if (!location || !semanticCandidateEligible(location)) continue;
      if (!reviewProfileNeedsSync(review, profile)) continue;
      selected.push(locationId);
      if (selected.length >= limit) break;
    }

    if (reviewRows.length < pageSize) break;
  }

  return selected;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const startedAt = new Date().toISOString();
  const runStartedAtMs = Date.now();
  const behavior = await supabaseAdmin.rpc("recalculate_behavioral_search_features", { p_window: "30 days" });
  const batchSize = Math.max(1, Math.min(250, Number(process.env.SEARCH_EMBEDDING_BATCH_SIZE || 100)));
  const candidatePoolSize = Math.min(400, Math.max(batchSize, batchSize * 2));
  const maxRunMs = Math.max(
    60_000,
    Math.min(240_000, Number(process.env.SEARCH_PHASE13_MAX_RUN_MS || 240_000)),
  );
  let reviewPriorityLocationIds: string[] = [];
  try {
    reviewPriorityLocationIds = await getReviewPriorityLocationIds(candidatePoolSize);
  } catch (caught) {
    return NextResponse.json({
      ok: false,
      behavior: behavior.data ?? null,
      error: caught instanceof Error ? caught.message : "review_priority_queue_failed",
    }, { status: 500 });
  }

  let embeddingBackfillLocationIds: string[] = [];
  try {
    embeddingBackfillLocationIds = await getEmbeddingBackfillCandidateIds(candidatePoolSize);
  } catch (caught) {
    return NextResponse.json({
      ok: false,
      behavior: behavior.data ?? null,
      error: caught instanceof Error ? caught.message : "embedding_backfill_candidate_selection_failed",
    }, { status: 500 });
  }

  const queuedLocationIds = uniq([
    reviewPriorityLocationIds,
    embeddingBackfillLocationIds,
  ]).slice(0, candidatePoolSize);
  const { data: rows, error } = queuedLocationIds.length
    ? await supabaseAdmin.from("locations").select("*").in("id", queuedLocationIds)
    : { data: [] as any[], error: null };
  if (error) return NextResponse.json({ ok: false, behavior: behavior.data ?? null, error: error.message }, { status: 500 });

  const rowByLocation = new Map((rows ?? []).map((row: any) => [String(row.id), row]));
  const orderedRows = queuedLocationIds
    .map((locationId) => rowByLocation.get(String(locationId)))
    .filter(Boolean);
  const locationIds = orderedRows.map((row: any) => row.id).filter(Boolean);
  const [{ data: reviewRows }, { data: profileRows }, { data: existingEmbeddingRows }] = locationIds.length
    ? await Promise.all([
        supabaseAdmin
          .from("location_review_ml_features")
          .select("location_id,romantic_score,quiet_score,relaxed_score,lively_score,photo_worthy_score,date_night_score,group_score,family_score,noise_penalty,service_penalty,overpriced_penalty,best_for_terms,avoid_if_terms,review_confidence_score")
          .in("location_id", locationIds),
        supabaseAdmin
          .from("location_search_profiles")
          .select("location_id,vibes,occasions,canonical_terms,evidence")
          .in("location_id", locationIds),
        supabaseAdmin
          .from("location_search_embeddings")
          .select("location_id,semantic_document_hash,embedding_version,status")
          .in("location_id", locationIds),
      ])
    : [{ data: [] as any[] }, { data: [] as any[] }, { data: [] as any[] }];

  const reviewByLocation = new Map((reviewRows ?? []).map((row: any) => [String(row.location_id), row]));
  const profileByLocation = new Map((profileRows ?? []).map((row: any) => [String(row.location_id), row]));
  const embeddingByLocation = new Map((existingEmbeddingRows ?? []).map((row: any) => [String(row.location_id), row]));

  let scanned = 0;
  let updated = 0;
  let unchanged = 0;
  let reviewProfilesUpdated = 0;
  let skippedIneligible = 0;
  let skippedUnsupported = 0;
  let timeBudgetReached = false;
  const failures: Array<{ locationId: string; error: string }> = [];
  const minEmbeddingIntervalMs = Math.max(
    0,
    Math.min(5_000, Number(process.env.SEARCH_EMBEDDING_MIN_INTERVAL_MS || 1_500)),
  );
  let lastEmbeddingRequestAt = 0;

  for (const location of orderedRows) {
    if (scanned >= batchSize) break;
    if (Date.now() - runStartedAtMs >= maxRunMs) {
      timeBudgetReached = true;
      break;
    }
    try {
      const review = reviewByLocation.get(String(location.id));
      const enrichedLocation = enrichedForSemantic(location, review);
      const document = buildLocationSemanticDocument(enrichedLocation as any);
      if (!document.eligibleForPublicEmbedding) {
        skippedIneligible += 1;
        continue;
      }
      const classification = classifySearchLocation(enrichedLocation as any);
      if (classification.canonicalType === "unsupported") {
        skippedUnsupported += 1;
        continue;
      }
      const embeddingCanonicalType =
        classification.canonicalType === "nightlife"
          ? "activity"
          : classification.canonicalType;
      scanned += 1;

      const profile = profileByLocation.get(String(location.id));
      if (profile && review) {
        const reviewProfilePatch = {
          vibes: uniq([profile.vibes, reviewVibes(review)]),
          occasions: uniq([profile.occasions, reviewOccasions(review)]),
          canonical_terms: uniq([profile.canonical_terms, review.best_for_terms]),
          evidence: {
            ...(profile.evidence && typeof profile.evidence === "object" ? profile.evidence : {}),
            review_intelligence: {
              best_for: uniq([review.best_for_terms]),
              avoid_if: uniq([review.avoid_if_terms]),
              vibes: reviewVibes(review),
              occasions: reviewOccasions(review),
              confidence: Number(review.review_confidence_score ?? 0),
              synced_at: new Date().toISOString(),
            },
          },
          updated_at: new Date().toISOString(),
        };
        const { error: profileError } = await supabaseAdmin
          .from("location_search_profiles")
          .update(reviewProfilePatch)
          .eq("location_id", location.id);
        if (profileError) throw profileError;
        reviewProfilesUpdated += 1;
      }

      const existing = embeddingByLocation.get(String(location.id));
      const expectedVersion = process.env.SEARCH_EMBEDDING_VERSION || EMBEDDING_VERSION;
      if (
        existing?.status === "ready" &&
        existing?.embedding_version === expectedVersion &&
        existing?.semantic_document_hash === document.semanticDocumentHash
      ) {
        unchanged += 1;
        continue;
      }

      if (lastEmbeddingRequestAt > 0 && minEmbeddingIntervalMs > 0) {
        const elapsed = Date.now() - lastEmbeddingRequestAt;
        if (elapsed < minEmbeddingIntervalMs) {
          await new Promise((resolve) =>
            setTimeout(resolve, minEmbeddingIntervalMs - elapsed),
          );
        }
      }
      lastEmbeddingRequestAt = Date.now();
      const embedding = await embed(document.semanticDocument);
      const { error: upsertError } = await supabaseAdmin.from("location_search_embeddings").upsert({
        location_id: location.id,
        embedding,
        canonical_search_type: embeddingCanonicalType,
        market_key: location.market ?? location.default_market_id ?? null,
        embedding_model: process.env.SEARCH_EMBEDDING_MODEL || EMBEDDING_MODEL,
        embedding_version: expectedVersion,
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
    supabaseAdmin.from("location_search_embeddings").select("location_id", { count: "exact", head: true }).eq("status", "ready"),
  ]);

  await supabaseAdmin.from("search_embedding_runs").insert({
    status: failures.length ? "completed_with_errors" : "completed",
    embedding_model: process.env.SEARCH_EMBEDDING_MODEL || EMBEDDING_MODEL,
    embedding_version: process.env.SEARCH_EMBEDDING_VERSION || EMBEDDING_VERSION,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    records_scanned: scanned,
    records_updated: updated,
    records_failed: failures.length,
    errors: failures.slice(0, 20),
  });

  return NextResponse.json({
    ok: true,
    behavior: behavior.data ?? null,
    embeddings: {
      queued: queuedLocationIds.length,
      candidatePool: queuedLocationIds.length,
      reviewPriorityQueued: reviewPriorityLocationIds.length,
      embeddingBackfillQueued: embeddingBackfillLocationIds.length,
      scanned,
      updated,
      unchanged,
      reviewProfilesUpdated,
      skippedIneligible,
      skippedUnsupported,
      failed: failures.length,
      elapsedMs: Date.now() - runStartedAtMs,
      maxRunMs,
      timeBudgetReached,
      ready: readyEmbeddingCount ?? 0,
      searchable: searchableCount ?? 0,
      remainingApprox: Math.max(0, Number(searchableCount ?? 0) - Number(readyEmbeddingCount ?? 0)),
      failures: failures.slice(0, 10),
    },
  });
}
