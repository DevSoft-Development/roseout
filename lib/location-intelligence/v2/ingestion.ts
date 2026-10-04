import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { attachExternalIdentity, type ExternalIdentityProvider } from "@/lib/location-intelligence/v2/identity";

function sourceProvider(source: string): ExternalIdentityProvider | null {
  const value = String(source || "").toLowerCase();
  if (value.includes("google")) return "google";
  if (value.includes("dataforseo")) return "dataforseo";
  if (value.includes("mapbox")) return "mapbox";
  return null;
}

export async function registerInitialLocationIntelligenceV2(input: {
  locationId: string;
  source: string;
  sourceId?: string | null;
  googlePlaceId?: string | null;
  rawPayload?: Record<string, unknown> | null;
  qualityScore?: number | null;
}) {
  const now = new Date().toISOString();
  const provider = sourceProvider(input.source);

  if (input.googlePlaceId) {
    await attachExternalIdentity({
      locationId: input.locationId,
      provider: "google",
      externalId: input.googlePlaceId,
      metadata: { source: input.source, initialIngestion: true },
    });
  }
  if (provider && input.sourceId && !(provider === "google" && input.sourceId === input.googlePlaceId)) {
    await attachExternalIdentity({
      locationId: input.locationId,
      provider,
      externalId: input.sourceId,
      metadata: { source: input.source, initialIngestion: true },
    });
  }

  let snapshotId: string | null = null;
  if (input.rawPayload && Object.keys(input.rawPayload).length) {
    const { data, error } = await supabaseAdmin
      .from("location_provider_snapshots")
      .insert({
        location_id: input.locationId,
        provider: provider || input.source || "unknown",
        provider_entity_id: input.sourceId || input.googlePlaceId || null,
        payload: input.rawPayload,
        schema_version: 1,
        processing_version: 1,
        retrieved_at: now,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Location Intelligence V2 snapshot write failed: ${error.message}`);
    snapshotId = data?.id ? String(data.id) : null;
  }

  const evidence = [
    input.googlePlaceId ? {
      location_id: input.locationId,
      provider: "google",
      provider_entity_id: input.googlePlaceId,
      evidence_type: "identity",
      field_name: "google_place_id",
      value: input.googlePlaceId,
      confidence: 1,
      snapshot_id: snapshotId,
      observed_at: now,
      metadata: { initialIngestion: true },
    } : null,
    {
      location_id: input.locationId,
      provider: provider || input.source || "unknown",
      provider_entity_id: input.sourceId || null,
      evidence_type: "identity",
      field_name: "source_identity",
      value: { source: input.source, sourceId: input.sourceId || null },
      confidence: 1,
      snapshot_id: snapshotId,
      observed_at: now,
      metadata: { initialIngestion: true },
    },
  ].filter(Boolean);

  if (evidence.length) {
    const { error } = await supabaseAdmin.from("location_evidence_v2").insert(evidence);
    if (error) throw new Error(`Location Intelligence V2 evidence write failed: ${error.message}`);
  }

  const score = Math.max(0, Math.min(100, Number(input.qualityScore || 0)));
  const { error: profileError } = await supabaseAdmin
    .from("location_intelligence_profiles_v2")
    .upsert({
      location_id: input.locationId,
      profile_version: 1,
      quality_score: score,
      search_v3_ready: false,
      routine_paid_refresh_enabled: false,
      updated_at: now,
    }, { onConflict: "location_id" });
  if (profileError) throw new Error(`Location Intelligence V2 profile initialization failed: ${profileError.message}`);

  return { snapshotId };
}
