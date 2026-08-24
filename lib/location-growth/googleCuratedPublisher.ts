import { supabaseAdmin } from "@/lib/supabase-admin";
import { cacheGooglePlacePhotoToStorage } from "@/lib/location-growth/cacheGooglePhoto";
import { publishReadyStagedLocations } from "@/lib/location-growth/publishReady";

const SOURCE = "google_curated_discovery";

type StagedCandidate = {
  id: string;
  source_id: string;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  rejection_reason?: string | null;
};

function mergeReason(current: unknown, next: string) {
  const values = String(current || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!values.includes(next)) values.push(next);
  return values.join(",");
}

async function backfillPublishedGooglePlaceIds(batchId: string) {
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("id,import_source_id")
    .eq("import_source", SOURCE)
    .is("google_place_id", null)
    .not("import_source_id", "is", null)
    .limit(200);
  if (error) throw new Error(`Unable to find published curated Google locations: ${error.message}`);

  let updated = 0;
  for (const row of data || []) {
    const { data: staged } = await supabaseAdmin
      .from("location_import_staging")
      .select("id")
      .eq("batch_id", batchId)
      .eq("source", SOURCE)
      .eq("source_id", row.import_source_id)
      .limit(1);
    if (!staged?.[0]) continue;

    const { error: updateError } = await supabaseAdmin
      .from("locations")
      .update({ google_place_id: row.import_source_id })
      .eq("id", row.id)
      .is("google_place_id", null);
    if (!updateError) updated += 1;
  }
  return updated;
}

export async function publishCuratedGoogleCandidates({
  batchId,
  limit = 50,
}: {
  batchId: string;
  limit?: number;
}) {
  const safeLimit = Math.min(100, Math.max(1, Math.trunc(Number(limit) || 50)));
  const { data, error } = await supabaseAdmin
    .from("location_import_staging")
    .select("id,source_id,name,restaurant_name,activity_name,rejection_reason")
    .eq("batch_id", batchId)
    .eq("source", SOURCE)
    .eq("import_status", "staged")
    .eq("quality_status", "publish_ready")
    .eq("duplicate_status", "unique")
    .order("quality_score", { ascending: false })
    .limit(safeLimit);

  if (error) throw new Error(`Unable to load curated publish candidates: ${error.message}`);

  const candidates = (data || []) as StagedCandidate[];
  let cached = 0;
  let downgradedToReview = 0;
  const cacheErrors: string[] = [];

  for (const candidate of candidates) {
    try {
      const stored = await cacheGooglePlacePhotoToStorage({
        id: candidate.id,
        name: candidate.name,
        restaurant_name: candidate.restaurant_name,
        activity_name: candidate.activity_name,
        google_place_id: candidate.source_id,
      });

      const { error: updateError } = await supabaseAdmin
        .from("location_import_staging")
        .update({
          main_image: stored.publicUrl,
          images: [stored.publicUrl],
          has_photos: true,
          photo_status: "cached",
          updated_at: new Date().toISOString(),
        })
        .eq("id", candidate.id)
        .eq("batch_id", batchId);
      if (updateError) throw new Error(updateError.message);
      cached += 1;
    } catch (cacheError) {
      const message = cacheError instanceof Error ? cacheError.message : String(cacheError);
      cacheErrors.push(`${candidate.name || candidate.source_id}: ${message}`);
      downgradedToReview += 1;
      await supabaseAdmin
        .from("location_import_staging")
        .update({
          quality_status: "review",
          curation_tier: "review",
          import_confidence: "medium",
          source_quality_status: "curated_google_photo_review",
          rejection_reason: mergeReason(candidate.rejection_reason, "photo_cache_failed"),
          updated_at: new Date().toISOString(),
        })
        .eq("id", candidate.id)
        .eq("batch_id", batchId);
    }
  }

  const published = cached > 0
    ? await publishReadyStagedLocations({ batchId, limit: cached })
    : { inserted: 0, markedPublished: 0, skipped: 0, errors: [] as string[] };
  const googlePlaceIdsBackfilled = published.markedPublished > 0
    ? await backfillPublishedGooglePlaceIds(batchId)
    : 0;

  const { data: batch } = await supabaseAdmin
    .from("location_import_batches")
    .select("metadata")
    .eq("id", batchId)
    .maybeSingle();
  const metadata = batch?.metadata && typeof batch.metadata === "object" && !Array.isArray(batch.metadata)
    ? batch.metadata as Record<string, unknown>
    : {};

  await supabaseAdmin
    .from("location_import_batches")
    .update({
      total_published: published.markedPublished,
      metadata: {
        ...metadata,
        publisher: {
          cached,
          downgradedToReview,
          published: published.markedPublished,
          inserted: published.inserted,
          skipped: published.skipped,
          googlePlaceIdsBackfilled,
          cacheErrors: cacheErrors.slice(0, 20),
          publishErrors: published.errors.slice(0, 20),
        },
      },
    })
    .eq("id", batchId);

  return {
    success: published.errors.length === 0,
    batchId,
    candidates: candidates.length,
    cached,
    downgradedToReview,
    published: published.markedPublished,
    inserted: published.inserted,
    skipped: published.skipped,
    googlePlaceIdsBackfilled,
    cacheErrors: cacheErrors.slice(0, 20),
    publishErrors: published.errors.slice(0, 20),
  };
}
