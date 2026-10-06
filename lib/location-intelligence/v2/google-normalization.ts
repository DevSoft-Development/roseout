import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { refreshLocationClassificationV2 } from "@/lib/location-intelligence/v2/classification";
import { attachExternalIdentity, resolveTohLocationByExternalIdentity } from "@/lib/location-intelligence/v2/identity";
import { maintenanceModeForLocation } from "@/lib/location-intelligence/v2/policy";
import { refreshLocationReadiness } from "@/lib/location-intelligence/v2/readiness";

function compactObject(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => {
      if (value == null) return false;
      if (typeof value === "string") return value.trim().length > 0;
      if (Array.isArray(value)) return value.length > 0;
      return true;
    }),
  );
}

function operationalStatus(row: Record<string, any>) {
  const google = String(row.google_business_status || "").trim().toUpperCase();
  if (google === "CLOSED_PERMANENTLY") return "permanently_closed";
  if (google === "CLOSED_TEMPORARILY") return "temporarily_closed";
  if (google === "OPERATIONAL") return "active";
  return row.active === false ? "unknown" : "active";
}

async function normalizeOneLocation(locationId: string) {
  const { data: location, error } = await supabaseAdmin
    .from("locations")
    .select("*")
    .eq("id", locationId)
    .single();
  if (error) throw new Error(`Google normalization location read failed: ${error.message}`);

  const googlePlaceId = String(location.google_place_id || "").trim();
  if (googlePlaceId) {
    const attached = await resolveTohLocationByExternalIdentity("google", googlePlaceId);
    if (!attached || attached === locationId) {
      await attachExternalIdentity({
        locationId,
        provider: "google",
        externalId: googlePlaceId,
        metadata: {
          source: "existing_google_enrichment_normalization",
          google_enriched_at: location.google_enriched_at || null,
        },
      });
    }
  }

  const identity = compactObject({
    google_place_id: googlePlaceId || null,
    location_key: location.location_key || null,
  });
  const geography = compactObject({
    address: location.address,
    city: location.city,
    state: location.state,
    zip_code: location.zip_code,
    neighborhood: location.neighborhood,
    borough: location.borough,
    latitude: location.latitude,
    longitude: location.longitude,
  });
  const features = compactObject({
    phone: location.phone,
    website: location.website || location.google_website_uri,
    operating_hours: location.operating_hours,
    primary_category: location.primary_category,
    cuisine: location.cuisine,
    cuisine_type: location.cuisine_type,
    activity_type: location.activity_type,
    tags: location.tags,
    semantic_tags: location.semantic_tags,
    vibe_tags: location.vibe_tags,
  });
  const occasions = compactObject({
    best_for_tags: location.best_for_tags,
  });
  const reviews = compactObject({
    rating: location.rating ?? location.google_rating,
    review_count: location.review_count ?? location.google_user_rating_count,
    google_rating: location.google_rating,
    google_user_rating_count: location.google_user_rating_count,
  });
  const provenance = {
    normalization_source: "existing_canonical_and_google_enrichment",
    google_enriched_at: location.google_enriched_at || null,
    external_provider_call: false,
    normalized_at: new Date().toISOString(),
  };

  const now = new Date().toISOString();
  const { error: profileError } = await supabaseAdmin
    .from("location_intelligence_profiles_v2")
    .upsert({
      location_id: locationId,
      maintenance_mode: maintenanceModeForLocation(location as Record<string, unknown>),
      operational_status: operationalStatus(location),
      identity,
      geography,
      features,
      occasions,
      reviews,
      provenance,
      last_initial_enrichment_at: now,
      routine_paid_refresh_enabled: false,
      updated_at: now,
    }, { onConflict: "location_id" });
  if (profileError) throw new Error(`Google normalization profile write failed: ${profileError.message}`);

  const classification = await refreshLocationClassificationV2(locationId);
  const readiness = await refreshLocationReadiness(locationId);

  return {
    locationId,
    normalized: true,
    searchV3Ready: readiness.searchV3Ready,
    qualityScore: readiness.qualityScore,
    classificationDomain: classification.domain,
  };
}

export async function normalizeExistingGoogleEnrichmentBatch(limit = 100) {
  const safeLimit = Math.max(1, Math.min(250, Math.trunc(limit)));
  const { data, error } = await supabaseAdmin
    .from("location_intelligence_profiles_v2")
    .select("location_id,last_initial_enrichment_at,locations!inner(google_enriched_at)")
    .is("last_initial_enrichment_at", null)
    .not("locations.google_enriched_at", "is", null)
    .order("locations(google_enriched_at)", { ascending: true, nullsFirst: false })
    .limit(safeLimit);
  if (error) throw new Error(`Google normalization batch plan failed: ${error.message}`);

  const results: Array<Record<string, unknown>> = [];
  for (const row of data || []) {
    const locationId = String((row as any).location_id || "");
    if (!locationId) continue;
    try {
      results.push(await normalizeOneLocation(locationId));
    } catch (error) {
      results.push({
        locationId,
        normalized: false,
        error: error instanceof Error ? error.message : "google_normalization_failed",
      });
    }
  }

  return {
    attempted: results.length,
    succeeded: results.filter((row) => row.normalized === true).length,
    failed: results.filter((row) => row.normalized === false).length,
    searchV3Ready: results.filter((row) => row.searchV3Ready === true).length,
    results,
  };
}
