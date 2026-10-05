import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { recordLocationIntelligenceStage } from "@/lib/location-intelligence/lifecycle";
import type { LocationEvidenceType, LocationProviderResponse } from "@/lib/location-intelligence/v2/contracts";
import { executeWithProviderFallback, LOCATION_INTELLIGENCE_ADAPTERS } from "@/lib/location-intelligence/v2/orchestrator";
import {
  maintenanceModeForLocation,
  recentGoogleCanonicalReuse,
  shouldRunPaidBusinessProfileBootstrap,
} from "@/lib/location-intelligence/v2/policy";
import { refreshLocationReadiness } from "@/lib/location-intelligence/v2/readiness";
import { refreshLocationClassificationV2 } from "@/lib/location-intelligence/v2/classification";
import { scheduleReviewRefresh } from "@/lib/location-intelligence/v2/reviews";
import { recordLocationEvidence, reconcileCanonicalFields, storeProviderSnapshot } from "@/lib/location-intelligence/v2/evidence";
import { attachExternalIdentity, resolveTohLocationByExternalIdentity } from "@/lib/location-intelligence/v2/identity";
import {
  canonicalFieldsFromDataForSeoBusinessProfile,
  selectDataForSeoBusinessProfile,
} from "@/lib/location-intelligence/v2/business-profile";

function googleCandidateIds(data: unknown) {
  if (!Array.isArray(data)) return [];
  return [...new Set(data.map((value) => String(value || "").trim()).filter(Boolean))];
}

export function safeSingleGooglePlaceId(data: unknown) {
  const candidates = googleCandidateIds(data);
  return candidates.length === 1 ? candidates[0] : null;
}

async function resolveSafeGooglePlaceId(locationId: string, data: unknown) {
  const candidates = googleCandidateIds(data);
  for (const candidate of candidates) {
    const attached = await resolveTohLocationByExternalIdentity("google", candidate);
    if (attached === locationId) return candidate;
  }

  const single = safeSingleGooglePlaceId(candidates);
  if (!single) return null;
  const attached = await resolveTohLocationByExternalIdentity("google", single);
  return attached ? null : single;
}

async function persistProviderObservation(input: {
  locationId: string;
  response: LocationProviderResponse;
  evidenceType: LocationEvidenceType;
  field: string;
  evidenceValue?: unknown;
  providerEntityId?: string | null;
  confidence?: number | null;
}) {
  const snapshotId = await storeProviderSnapshot({
    locationId: input.locationId,
    provider: input.response.providerId,
    providerEntityId: input.providerEntityId || null,
    payload: input.response.data,
  });

  await recordLocationEvidence({
    locationId: input.locationId,
    provider: input.response.providerId,
    providerEntityId: input.providerEntityId || null,
    evidenceType: input.evidenceType,
    field: input.field,
    value: input.evidenceValue ?? {
      snapshotId,
      capability: input.response.capability,
    },
    confidence: input.confidence ?? null,
    snapshotId,
    metadata: {
      initialEnrichment: true,
      capability: input.response.capability,
    },
  });

  return snapshotId;
}

export async function runInitialLocationEnrichmentV2(locationId: string) {
  const { data: location, error } = await supabaseAdmin
    .from("locations")
    .select("id,name,restaurant_name,activity_name,address,city,state,zip_code,latitude,longitude,website,google_place_id,is_claimed,claimed,claim_status,owner_user_id,popularity_score,phone,operating_hours,primary_category,description,main_image,rating,review_count,google_enriched_at,google_website_uri,google_rating,google_user_rating_count")
    .eq("id", locationId)
    .single();
  if (error) throw new Error(`Initial enrichment location read failed: ${error.message}`);

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("location_intelligence_profiles_v2")
    .select("last_initial_enrichment_at,identity")
    .eq("location_id", locationId)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);
  if (profile?.last_initial_enrichment_at) {
    return { locationId, skipped: true, reason: "initial_enrichment_already_completed" };
  }

  const existingIdentity = profile?.identity && typeof profile.identity === "object" && !Array.isArray(profile.identity)
    ? profile.identity as Record<string, unknown>
    : {};
  const mode = maintenanceModeForLocation(location as Record<string, unknown>);
  const name = String(location.name || location.restaurant_name || location.activity_name || "").trim();
  const query = [name, location.address, location.city, location.state].filter(Boolean).join(", ");

  await recordLocationIntelligenceStage({
    locationId,
    stage: "normalize",
    status: "running",
    eventType: "v2_initial_enrichment_started",
    metadata: { maintenanceMode: mode },
  });

  const snapshots: string[] = [];
  let canonicalGooglePlaceId = String(location.google_place_id || "").trim();
  let profileGooglePlaceId: string | null = canonicalGooglePlaceId || null;

  if (canonicalGooglePlaceId) {
    const attachedLocationId = await resolveTohLocationByExternalIdentity("google", canonicalGooglePlaceId);
    if (attachedLocationId && attachedLocationId !== locationId) {
      profileGooglePlaceId = null;
      await recordLocationEvidence({
        locationId,
        provider: "google",
        providerEntityId: canonicalGooglePlaceId,
        evidenceType: "identity",
        field: "google_place_id_conflict",
        value: {
          google_place_id: canonicalGooglePlaceId,
          attached_location_id: attachedLocationId,
        },
        confidence: 1,
        metadata: {
          source: "canonical_location",
          initialEnrichment: true,
          conflict: "external_identity_already_attached",
        },
      });
    } else {
      await attachExternalIdentity({
        locationId,
        provider: "google",
        externalId: canonicalGooglePlaceId,
        metadata: { source: "canonical_location", initialEnrichment: true },
      });
      await recordLocationEvidence({
        locationId,
        provider: "google",
        providerEntityId: canonicalGooglePlaceId,
        evidenceType: "identity",
        field: "google_place_id",
        value: canonicalGooglePlaceId,
        confidence: 1,
        metadata: { source: "canonical_location", initialEnrichment: true },
      });
    }
  } else if (query) {
    let identity: LocationProviderResponse | null = null;
    try {
      identity = await executeWithProviderFallback({
        capability: "identity",
        purpose: "bootstrap",
        ownerMaintained: mode === "owner_maintained",
        input: { query, limit: 5 },
      });
    } catch {
      // Identity resolution can remain incomplete and be surfaced by readiness.
    }

    if (identity) {
      const candidates = googleCandidateIds(identity.data);
      snapshots.push(await persistProviderObservation({
        locationId,
        response: identity,
        evidenceType: "identity",
        field: "google_place_id_candidates",
        evidenceValue: candidates,
      }));

      const resolvedGooglePlaceId = await resolveSafeGooglePlaceId(locationId, candidates);
      if (resolvedGooglePlaceId) {
        await attachExternalIdentity({
          locationId,
          provider: "google",
          externalId: resolvedGooglePlaceId,
          metadata: { source: "location_intelligence_v2_identity", initialEnrichment: true },
        });
        await reconcileCanonicalFields({
          locationId,
          provider: "google",
          fields: { google_place_id: resolvedGooglePlaceId },
          confidence: 1,
          evidenceType: "identity",
          sourceRef: "location_intelligence_v2_identity",
        });
        canonicalGooglePlaceId = resolvedGooglePlaceId;
        profileGooglePlaceId = resolvedGooglePlaceId;
      }
    }
  }

  const reusableGoogleFields = recentGoogleCanonicalReuse(location as Record<string, unknown>);
  if (Object.keys(reusableGoogleFields).length > 0) {
    await reconcileCanonicalFields({
      locationId,
      provider: "google",
      fields: reusableGoogleFields,
      confidence: 1,
      evidenceType: "classification",
      sourceRef: "recent_google_enrichment_reuse",
    });
    Object.assign(location, reusableGoogleFields);
  }

  if (location.zip_code) {
    let geo: LocationProviderResponse | null = null;
    try {
      geo = await executeWithProviderFallback({
        capability: "public_geography",
        purpose: "bootstrap",
        ownerMaintained: mode === "owner_maintained",
        input: { zipCode: location.zip_code },
      });
    } catch {
      // Existing canonical geography remains usable.
    }
    if (geo) {
      snapshots.push(await persistProviderObservation({
        locationId,
        response: geo,
        evidenceType: "geography",
        field: "public_geography_snapshot",
      }));
    }
  }

  if (location.website) {
    let website: LocationProviderResponse | null = null;
    try {
      website = mode === "owner_maintained"
        ? await (async () => {
            const official = LOCATION_INTELLIGENCE_ADAPTERS.find((adapter) => adapter.descriptor.id === "official_website");
            if (!official) throw new Error("official_website_provider_missing");
            return official.execute({
              capability: "web_context",
              purpose: "bootstrap",
              ownerMaintained: true,
              input: { url: location.website, query },
            });
          })()
        : await executeWithProviderFallback({
            capability: "web_context",
            purpose: "bootstrap",
            ownerMaintained: false,
            input: { url: location.website, query },
          });
    } catch {
      // Website intelligence is gap-driven and non-blocking.
    }
    if (website) {
      snapshots.push(await persistProviderObservation({
        locationId,
        response: website,
        evidenceType: "website",
        field: "web_context_snapshot",
      }));
    }
  }

  if (!location.website && mode === "theouthaven_managed" && query) {
    let discovery: LocationProviderResponse | null = null;
    try {
      discovery = await executeWithProviderFallback({
        capability: "website_discovery",
        purpose: "bootstrap",
        ownerMaintained: false,
        input: { query, count: 5 },
      });
    } catch {
      // Website discovery is fallback-only and non-blocking.
    }
    if (discovery) {
      snapshots.push(await persistProviderObservation({
        locationId,
        response: discovery,
        evidenceType: "website",
        field: "website_discovery_snapshot",
      }));
    }
  }

  if (
    mode === "theouthaven_managed" &&
    name &&
    shouldRunPaidBusinessProfileBootstrap(location as Record<string, unknown>)
  ) {
    let profileResult: LocationProviderResponse | null = null;
    try {
      profileResult = await executeWithProviderFallback({
        capability: "business_profile",
        purpose: "bootstrap",
        ownerMaintained: false,
        input: {
          title: name,
          locationCoordinate:
            location.latitude != null && location.longitude != null
              ? `${location.latitude},${location.longitude},5`
              : undefined,
          limit: 10,
        },
      });
    } catch {
      // Paid provider gaps do not make the canonical location unusable.
    }
    if (profileResult) {
      snapshots.push(await persistProviderObservation({
        locationId,
        response: profileResult,
        evidenceType: "classification",
        field: "business_profile_snapshot",
      }));

      if (profileResult.providerId === "dataforseo") {
        const matchedProfile = selectDataForSeoBusinessProfile(profileResult.data, {
          name,
          googlePlaceId: canonicalGooglePlaceId || null,
        });
        const canonicalFields = canonicalFieldsFromDataForSeoBusinessProfile(matchedProfile);
        if (Object.keys(canonicalFields).length > 0) {
          await reconcileCanonicalFields({
            locationId,
            provider: "dataforseo",
            fields: canonicalFields,
            confidence: canonicalGooglePlaceId && String(matchedProfile?.place_id || "") === canonicalGooglePlaceId
              ? 0.98
              : 0.9,
            evidenceType: "classification",
            sourceRef: "location_intelligence_v2_business_profile",
          });
        }
      }
    }
  }

  const now = new Date().toISOString();
  await refreshLocationClassificationV2(locationId);
  const readiness = await refreshLocationReadiness(locationId);
  const { error: updateError } = await supabaseAdmin
    .from("location_intelligence_profiles_v2")
    .upsert({
      location_id: locationId,
      maintenance_mode: mode,
      last_initial_enrichment_at: now,
      routine_paid_refresh_enabled: false,
      identity: profileGooglePlaceId
        ? { ...existingIdentity, google_place_id: profileGooglePlaceId }
        : existingIdentity,
      updated_at: now,
    }, { onConflict: "location_id" });
  if (updateError) throw new Error(updateError.message);

  await scheduleReviewRefresh({
    locationId,
    provider: "dataforseo",
    popularityScore: Number(location.popularity_score || 0),
  });

  await recordLocationIntelligenceStage({
    locationId,
    stage: "complete",
    status: "completed",
    eventType: "v2_initial_enrichment_completed",
    metadata: { maintenanceMode: mode, snapshots: snapshots.length, readiness },
  });

  return { locationId, skipped: false, maintenanceMode: mode, snapshots: snapshots.length, readiness };
}
