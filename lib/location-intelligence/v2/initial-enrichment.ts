import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { recordLocationIntelligenceStage } from "@/lib/location-intelligence/lifecycle";
import { executeWithProviderFallback, LOCATION_INTELLIGENCE_ADAPTERS } from "@/lib/location-intelligence/v2/orchestrator";
import { maintenanceModeForLocation } from "@/lib/location-intelligence/v2/policy";
import { refreshLocationReadiness } from "@/lib/location-intelligence/v2/readiness";
import { refreshLocationClassificationV2 } from "@/lib/location-intelligence/v2/classification";
import { scheduleReviewRefresh } from "@/lib/location-intelligence/v2/reviews";
import { storeProviderSnapshot } from "@/lib/location-intelligence/v2/evidence";

export async function runInitialLocationEnrichmentV2(locationId: string) {
  const { data: location, error } = await supabaseAdmin
    .from("locations")
    .select("id,name,restaurant_name,activity_name,address,city,state,zip_code,latitude,longitude,website,google_place_id,is_claimed,claimed,claim_status,owner_user_id,popularity_score")
    .eq("id", locationId)
    .single();
  if (error) throw new Error(`Initial enrichment location read failed: ${error.message}`);

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("location_intelligence_profiles_v2")
    .select("last_initial_enrichment_at")
    .eq("location_id", locationId)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);
  if (profile?.last_initial_enrichment_at) {
    return { locationId, skipped: true, reason: "initial_enrichment_already_completed" };
  }

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

  if (!location.google_place_id && query) {
    try {
      const identity = await executeWithProviderFallback({
        capability: "identity",
        input: { query, limit: 5 },
      });
      snapshots.push(await storeProviderSnapshot({
        locationId,
        provider: identity.providerId,
        payload: identity.data,
      }));
    } catch {
      // Identity resolution can remain incomplete and be surfaced by readiness.
    }
  }

  if (location.zip_code) {
    try {
      const geo = await executeWithProviderFallback({
        capability: "public_geography",
        input: { zipCode: location.zip_code },
      });
      snapshots.push(await storeProviderSnapshot({
        locationId,
        provider: geo.providerId,
        payload: geo.data,
      }));
    } catch {
      // Existing canonical geography remains usable.
    }
  }

  if (location.website) {
    try {
      const website = mode === "owner_maintained"
        ? await (async () => {
            const official = LOCATION_INTELLIGENCE_ADAPTERS.find((adapter) => adapter.descriptor.id === "official_website");
            if (!official) throw new Error("official_website_provider_missing");
            return official.execute({
              capability: "web_context",
              input: { url: location.website, query },
            });
          })()
        : await executeWithProviderFallback({
            capability: "web_context",
            input: { url: location.website, query },
          });
      snapshots.push(await storeProviderSnapshot({
        locationId,
        provider: website.providerId,
        payload: website.data,
      }));
    } catch {
      // Website intelligence is gap-driven and non-blocking.
    }
  }

  if (mode === "theouthaven_managed" && name) {
    try {
      const profileResult = await executeWithProviderFallback({
        capability: "business_profile",
        input: {
          title: name,
          locationCoordinate:
            location.latitude != null && location.longitude != null
              ? `${location.latitude},${location.longitude},5km`
              : undefined,
          limit: 10,
        },
      });
      snapshots.push(await storeProviderSnapshot({
        locationId,
        provider: profileResult.providerId,
        payload: profileResult.data,
      }));
    } catch {
      // Paid provider gaps do not make the canonical location unusable.
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
