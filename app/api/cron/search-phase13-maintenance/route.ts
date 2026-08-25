import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildLocationSemanticDocument, EMBEDDING_MODEL, EMBEDDING_VERSION } from "@/lib/search/enterprise/semantic";
import { classifySearchLocation } from "@/lib/search/enterprise/classification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return request.headers.get("authorization") === `Bearer ${expected}`;
}

async function embed(text: string) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not configured");
  const model = process.env.SEARCH_EMBEDDING_MODEL || EMBEDDING_MODEL;
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: text }),
  });
  if (!response.ok) throw new Error(`embedding request failed: ${response.status}`);
  const payload = await response.json();
  return payload?.data?.[0]?.embedding as number[];
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

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const startedAt = new Date().toISOString();
  const behavior = await supabaseAdmin.rpc("recalculate_behavioral_search_features", { p_window: "30 days" });
  const { data: rows, error } = await supabaseAdmin
    .from("locations")
    .select("*")
    .eq("is_searchable", true)
    .eq("is_hidden", false)
    .eq("active", true)
    .is("deleted_at", null)
    .limit(Number(process.env.SEARCH_EMBEDDING_BATCH_SIZE || 50));
  if (error) return NextResponse.json({ ok: false, behavior: behavior.data ?? null, error: error.message }, { status: 500 });

  const locationIds = (rows ?? []).map((row: any) => row.id).filter(Boolean);
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

  let updated = 0;
  let unchanged = 0;
  let reviewProfilesUpdated = 0;
  const failures: Array<{ locationId: string; error: string }> = [];

  for (const location of rows ?? []) {
    try {
      const review = reviewByLocation.get(String(location.id));
      const enrichedLocation = enrichedForSemantic(location, review);
      const document = buildLocationSemanticDocument(enrichedLocation as any);
      if (!document.eligibleForPublicEmbedding) continue;
      const classification = classifySearchLocation(enrichedLocation as any);
      if (classification.canonicalType === "unsupported" || classification.canonicalType === "nightlife") continue;

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

      const embedding = await embed(document.semanticDocument);
      const { error: upsertError } = await supabaseAdmin.from("location_search_embeddings").upsert({
        location_id: location.id,
        embedding,
        canonical_search_type: classification.canonicalType,
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

  await supabaseAdmin.from("search_embedding_runs").insert({
    status: failures.length ? "completed_with_errors" : "completed",
    embedding_model: process.env.SEARCH_EMBEDDING_MODEL || EMBEDDING_MODEL,
    embedding_version: process.env.SEARCH_EMBEDDING_VERSION || EMBEDDING_VERSION,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    records_scanned: rows?.length ?? 0,
    records_updated: updated,
    records_failed: failures.length,
    errors: failures.slice(0, 20),
  });

  return NextResponse.json({
    ok: true,
    behavior: behavior.data ?? null,
    embeddings: {
      scanned: rows?.length ?? 0,
      updated,
      unchanged,
      reviewProfilesUpdated,
      failed: failures.length,
      failures: failures.slice(0, 10),
    },
  });
}
