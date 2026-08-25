import { supabaseAdmin } from "@/lib/supabase-admin";
import { publicGooglePlacePhotoUrl } from "@/lib/google/places-new-client";
import { publishReadyStagedLocations } from "@/lib/location-growth/publishReady";
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

async function prepareLiveGooglePhotos(batchId: string, candidates: StagedCandidate[]) {
  let prepared = 0;
  const errors: string[] = [];

  for (const candidate of candidates) {
    const liveUrl = publicGooglePlacePhotoUrl(candidate.source_id);
    if (!liveUrl) {
      errors.push(`${candidate.name || candidate.source_id}: missing Google Place ID for live photo`);
      continue;
    }

    const { error } = await supabaseAdmin
      .from("location_import_staging")
      .update({
        main_image: liveUrl,
        images: [liveUrl],
        has_photos: true,
        photo_status: "google_live_proxy",
        updated_at: new Date().toISOString(),
      })
      .eq("id", candidate.id)
      .eq("batch_id", batchId)
      .eq("source", SOURCE);

    if (error) {
      errors.push(`${candidate.name || candidate.source_id}: ${error.message}`);
      continue;
    }
    prepared += 1;
  }

  return { prepared, errors };
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
  const photoPreparation = await prepareLiveGooglePhotos(batchId, candidates);

  const published = photoPreparation.prepared > 0
    ? await publishReadyStagedLocations({ batchId, limit: photoPreparation.prepared })
    : { inserted: 0, markedPublished: 0, skipped: 0, errors: [] as string[] };

  const sourceIds = candidates.map((candidate) => candidate.source_id).filter(Boolean);
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
          photoMode: "live_google_place_id_proxy",
          photosPrepared: photoPreparation.prepared,
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
    candidates: candidates.length,
    photosPrepared: photoPreparation.prepared,
    cached: 0,
    downgradedToReview: 0,
    published: published.markedPublished,
    inserted: published.inserted,
    skipped: published.skipped,
    googlePlaceIdsBackfilled: 0,
    reservations,
    cacheErrors: photoPreparation.errors.slice(0, 20),
    publishErrors: published.errors.slice(0, 20),
  };
}