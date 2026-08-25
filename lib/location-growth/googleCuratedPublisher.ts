import { supabaseAdmin } from "@/lib/supabase-admin";
import { cacheGooglePlacePhotoToStorage } from "@/lib/location-growth/cacheGooglePhoto";
import { publishReadyStagedLocations } from "@/lib/location-growth/publishReady";
import { evaluateGoogleDiscoveryCandidate } from "@/lib/location-growth/googleDiscoveryQuality";
import { discoverReservationFromWebsite } from "@/lib/lightweight-reservation-discovery";
import {
  discoverReservationViaProviderSearch,
  hasReservationProviderSearchConfig,
} from "@/lib/reservation-provider-search";

const SOURCE = "google_curated_discovery";

type StagedCandidate = {
  id: string;
  source_id: string;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  rejection_reason?: string | null;
  quality_status?: string | null;
  photo_status?: string | null;
  location_type?: string | null;
  primary_tag?: string | null;
  primary_category?: string | null;
  rating?: number | null;
  review_count?: number | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  google_types?: string[] | null;
  raw_payload?: Record<string, unknown> | null;
};

type PublishedLocation = {
  id: string;
  name?: string | null;
  city?: string | null;
  state?: string | null;
  website?: string | null;
  reservation_url?: string | null;
  booking_url?: string | null;
  reservation_link?: string | null;
  external_reservation_url?: string | null;
  reservation_manual_override?: boolean | null;
  uses_internal_reservations?: boolean | null;
  internal_reservations_enabled?: boolean | null;
  reservation_source?: string | null;
  import_source_id?: string | null;
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function recordValue(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function hasHours(value: Record<string, any>) {
  const candidates = [
    value.opening_hours,
    value.current_opening_hours,
    value.regularOpeningHours,
    value.business_hours,
    value.hours,
    value.weekday_text,
  ];
  return candidates.some((candidate) => {
    if (!candidate) return false;
    if (Array.isArray(candidate)) return candidate.length > 0;
    if (typeof candidate === "object") return Object.keys(candidate).length > 0;
    return clean(candidate).length > 0;
  });
}

function removeReason(current: unknown, reason: string) {
  const next = String(current || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => value !== reason);
  return next.length ? next.join(",") : null;
}

function mergeReason(current: unknown, next: string) {
  const values = String(current || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!values.includes(next)) values.push(next);
  return values.join(",");
}

async function restorePreProxyPhotoEligibility(candidate: StagedCandidate) {
  if (candidate.quality_status === "publish_ready") return true;
  if (candidate.photo_status !== "requires_attribution_review") return false;

  const raw = recordValue(candidate.raw_payload);
  const google = recordValue(raw.google);
  const gap = recordValue(raw.gap);
  const photos = Array.isArray(google.photos) ? google.photos : [];
  if (!photos.length) return false;

  const kind = candidate.location_type === "restaurant" ? "restaurant" : "activity";
  const category = clean(gap.category || candidate.primary_tag || candidate.primary_category);
  const types = Array.isArray(google.types)
    ? google.types.map((value: unknown) => clean(value)).filter(Boolean)
    : Array.isArray(candidate.google_types)
      ? candidate.google_types
      : [];

  const quality = evaluateGoogleDiscoveryCandidate({
    kind,
    name: clean(candidate.name || candidate.restaurant_name || candidate.activity_name),
    query: clean(raw.query),
    category,
    rating: Number(candidate.rating || google.rating || 0),
    reviewCount: Number(candidate.review_count || google.user_ratings_total || google.review_count || 0),
    types,
    editorialSummary: clean(google.editorial_summary?.overview) || null,
    hasPhoto: true,
    hasPhone: Boolean(clean(candidate.phone || google.formatted_phone_number || google.international_phone_number)),
    hasWebsite: Boolean(clean(candidate.website || google.website || google.websiteUri)),
    hasHours: hasHours(google),
    hasLocation: Boolean(
      clean(candidate.address) &&
      clean(candidate.city) &&
      clean(candidate.state) &&
      Number.isFinite(Number(candidate.latitude)) &&
      Number.isFinite(Number(candidate.longitude)),
    ),
  });

  if (quality.decision !== "auto_import") return false;

  const { error } = await supabaseAdmin
    .from("location_import_staging")
    .update({
      quality_status: "publish_ready",
      quality_score: quality.score,
      curation_tier: "curated",
      import_confidence: "high",
      source_quality_status: "curated_google",
      rejection_reason: removeReason(candidate.rejection_reason, "google_photo_requires_attribution"),
      has_photos: true,
      photo_status: "google_photo_pending_cache",
      updated_at: new Date().toISOString(),
    })
    .eq("id", candidate.id)
    .eq("source", SOURCE)
    .eq("import_status", "staged")
    .eq("duplicate_status", "unique");

  if (error) throw new Error(`Unable to restore photo eligibility for ${candidate.name || candidate.source_id}: ${error.message}`);
  return true;
}

async function cacheGooglePhotos(batchId: string, candidates: StagedCandidate[]) {
  let cached = 0;
  let downgradedToReview = 0;
  const cachedCandidates: StagedCandidate[] = [];
  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      const stored = await cacheGooglePlacePhotoToStorage({
        id: candidate.id,
        name: candidate.name,
        restaurant_name: candidate.restaurant_name,
        activity_name: candidate.activity_name,
        google_place_id: candidate.source_id,
      });

      const { error } = await supabaseAdmin
        .from("location_import_staging")
        .update({
          main_image: stored.publicUrl,
          images: [stored.publicUrl],
          has_photos: true,
          photo_status: "cached",
          rejection_reason: removeReason(candidate.rejection_reason, "google_photo_requires_attribution"),
          updated_at: new Date().toISOString(),
        })
        .eq("id", candidate.id)
        .eq("batch_id", batchId)
        .eq("source", SOURCE);
      if (error) throw new Error(error.message);

      cached += 1;
      cachedCandidates.push(candidate);
    } catch (cacheError) {
      const message = cacheError instanceof Error ? cacheError.message : String(cacheError);
      errors.push(`${candidate.name || candidate.source_id}: ${message}`);
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
        .eq("batch_id", batchId)
        .eq("source", SOURCE);
    }
  }

  return { cached, downgradedToReview, cachedCandidates, errors };
}

function existingReservation(row: PublishedLocation) {
  return clean(
    row.external_reservation_url ||
      row.reservation_url ||
      row.booking_url ||
      row.reservation_link,
  );
}

function isOwnerOrInternalReservationProtected(row: PublishedLocation) {
  const source = clean(row.reservation_source).toLowerCase();
  return Boolean(
    row.reservation_manual_override ||
      row.uses_internal_reservations ||
      row.internal_reservations_enabled ||
      source === "internal" ||
      source === "both" ||
      existingReservation(row),
  );
}

async function applyReservationMatch(
  row: PublishedLocation,
  match: { url: string; provider: string },
  discoverySource: string,
) {
  const now = new Date().toISOString();
  const website = clean(row.website) || null;
  const { error } = await supabaseAdmin
    .from("locations")
    .update({
      external_reservation_url: match.url,
      reservation_url: match.url,
      booking_url: match.url,
      reservation_link: match.url,
      reservation_provider: match.provider,
      reservation_provider_url: match.url,
      reservation_provider_name: match.provider,
      reservation_provider_status: "discovered",
      reservation_platform: match.provider,
      reservation_platform_url: match.url,
      reservation_source: "external",
      reservation_source_url: website,
      reservation_external_url: match.url,
      reservation_discovery_status: "found",
      reservation_discovery_source: discoverySource,
      reservation_discovery_notes: `Discovered during curated Google import via ${discoverySource}.`,
      reservation_discovery_checked_at: now,
      reservation_last_checked_at: now,
      reservation_upgrade_opportunity: false,
      reservation_upgrade_reason: null,
    })
    .eq("id", row.id)
    .or("reservation_manual_override.is.null,reservation_manual_override.eq.false");
  if (error) throw new Error(error.message);
}

async function applyReservationStatus(
  row: PublishedLocation,
  status: "not_found" | "blocked" | "failed",
  note: string,
  source: string,
) {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("locations")
    .update({
      reservation_discovery_status: status,
      reservation_discovery_source: source,
      reservation_discovery_notes: note.slice(0, 1000),
      reservation_discovery_checked_at: now,
      reservation_last_checked_at: now,
    })
    .eq("id", row.id)
    .or("reservation_manual_override.is.null,reservation_manual_override.eq.false");
  if (error) throw new Error(error.message);
}

async function enrichPublishedReservations(sourceIds: string[]) {
  if (!sourceIds.length) {
    return { checked: 0, found: 0, notFound: 0, blocked: 0, failed: 0, skippedProtected: 0, errors: [] as string[] };
  }

  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("id,name,city,state,website,reservation_url,booking_url,reservation_link,external_reservation_url,reservation_manual_override,uses_internal_reservations,internal_reservations_enabled,reservation_source,import_source_id")
    .eq("import_source", SOURCE)
    .in("import_source_id", sourceIds);
  if (error) throw new Error(`Unable to load published locations for reservation enrichment: ${error.message}`);

  const counts = {
    checked: 0,
    found: 0,
    notFound: 0,
    blocked: 0,
    failed: 0,
    skippedProtected: 0,
    errors: [] as string[],
  };

  for (const row of (data || []) as PublishedLocation[]) {
    if (isOwnerOrInternalReservationProtected(row)) {
      counts.skippedProtected += 1;
      continue;
    }

    counts.checked += 1;
    const website = clean(row.website);
    let websiteResult: Awaited<ReturnType<typeof discoverReservationFromWebsite>> | null = null;

    try {
      if (website) {
        websiteResult = await discoverReservationFromWebsite(website);
        if (websiteResult.match) {
          await applyReservationMatch(row, websiteResult.match, "venue_website");
          counts.found += 1;
          continue;
        }
      }

      if (hasReservationProviderSearchConfig()) {
        const providerResult = await discoverReservationViaProviderSearch({
          name: clean(row.name),
          city: clean(row.city) || null,
          state: clean(row.state) || null,
        });
        if (providerResult.best) {
          await applyReservationMatch(row, providerResult.best, "provider_search");
          counts.found += 1;
          continue;
        }
      }

      if (websiteResult?.status === "blocked") {
        await applyReservationStatus(
          row,
          "blocked",
          websiteResult.error || "Venue website blocked reservation discovery.",
          "venue_website",
        );
        counts.blocked += 1;
      } else if (websiteResult?.status === "failed") {
        await applyReservationStatus(
          row,
          "failed",
          websiteResult.error || "Venue website reservation discovery failed.",
          "venue_website",
        );
        counts.failed += 1;
      } else {
        await applyReservationStatus(
          row,
          "not_found",
          website
            ? "No supported external reservation provider was found during curated import."
            : "No venue website or supported provider result was available during curated import.",
          website ? "venue_website" : "provider_search",
        );
        counts.notFound += 1;
      }
    } catch (reservationError) {
      const message = reservationError instanceof Error ? reservationError.message : String(reservationError);
      counts.failed += 1;
      counts.errors.push(`${row.name || row.id}: ${message}`);
      try {
        await applyReservationStatus(row, "failed", message, "curated_import");
      } catch {
        // Keep the publisher moving; the failure is already captured above.
      }
    }
  }

  return counts;
}

export async function publishCuratedGoogleCandidates({
  batchId,
  limit = 50,
}: {
  batchId: string;
  limit?: number;
}) {
  const safeLimit = Math.min(100, Math.max(1, Math.trunc(Number(limit) || 50)));
  const scanLimit = Math.min(200, Math.max(safeLimit, safeLimit * 3));
  const { data, error } = await supabaseAdmin
    .from("location_import_staging")
    .select("id,source_id,name,restaurant_name,activity_name,rejection_reason,quality_status,photo_status,location_type,primary_tag,primary_category,rating,review_count,phone,website,address,city,state,latitude,longitude,google_types,raw_payload")
    .eq("batch_id", batchId)
    .eq("source", SOURCE)
    .eq("import_status", "staged")
    .eq("duplicate_status", "unique")
    .order("quality_score", { ascending: false })
    .limit(scanLimit);

  if (error) throw new Error(`Unable to load curated publish candidates: ${error.message}`);

  const eligible: StagedCandidate[] = [];
  for (const candidate of (data || []) as StagedCandidate[]) {
    if (eligible.length >= safeLimit) break;
    if (await restorePreProxyPhotoEligibility(candidate)) eligible.push(candidate);
  }

  const photoPreparation = await cacheGooglePhotos(batchId, eligible);

  const published = photoPreparation.cached > 0
    ? await publishReadyStagedLocations({ batchId, limit: photoPreparation.cached })
    : { inserted: 0, markedPublished: 0, skipped: 0, errors: [] as string[] };

  const sourceIds = photoPreparation.cachedCandidates
    .map((candidate) => candidate.source_id)
    .filter(Boolean);
  const reservations = published.markedPublished > 0
    ? await enrichPublishedReservations(sourceIds)
    : { checked: 0, found: 0, notFound: 0, blocked: 0, failed: 0, skippedProtected: 0, errors: [] as string[] };

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
          photoMode: "supabase_storage_cached_google_photo_temporary_rollback",
          photosPrepared: photoPreparation.cached,
          cached: photoPreparation.cached,
          downgradedToReview: photoPreparation.downgradedToReview,
          published: published.markedPublished,
          inserted: published.inserted,
          skipped: published.skipped,
          reservationEnrichment: reservations,
          photoErrors: photoPreparation.errors.slice(0, 20),
          publishErrors: published.errors.slice(0, 20),
        },
      },
    })
    .eq("id", batchId);

  return {
    success:
      published.errors.length === 0 &&
      photoPreparation.errors.length === 0 &&
      reservations.errors.length === 0,
    batchId,
    candidates: eligible.length,
    photosPrepared: photoPreparation.cached,
    cached: photoPreparation.cached,
    downgradedToReview: photoPreparation.downgradedToReview,
    published: published.markedPublished,
    inserted: published.inserted,
    skipped: published.skipped,
    googlePlaceIdsBackfilled: 0,
    reservations,
    cacheErrors: photoPreparation.errors.slice(0, 20),
    publishErrors: published.errors.slice(0, 20),
  };
}
