import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import type { LocationEvidence, LocationEvidenceType } from "@/lib/location-intelligence/v2/contracts";
import type { LocationAuthoritySource } from "@/lib/location-intelligence/source-precedence";
import { filterLocationProviderUpdate } from "@/lib/location-intelligence/source-precedence";

function authorityForProvider(provider: string): LocationAuthoritySource {
  if (provider === "owner") return "owner";
  if (provider === "toh_internal") return "trusted_internal";
  if (provider === "google") return "google";
  if (provider === "official_website") return "official_website";
  if (provider === "azure_ai") return "ai_inference";
  return "secondary_provider";
}

export async function recordLocationEvidence(input: Omit<LocationEvidence, "observedAt"> & { observedAt?: string }) {
  const observedAt = input.observedAt || new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("location_evidence_v2")
    .insert({
      location_id: input.locationId,
      provider: input.provider,
      provider_entity_id: input.providerEntityId || null,
      evidence_type: input.evidenceType,
      field_name: input.field,
      value: input.value,
      confidence: input.confidence ?? null,
      observed_at: observedAt,
      source_url: input.sourceUrl || null,
      snapshot_id: input.snapshotId || null,
      metadata: input.metadata || {},
    })
    .select("id")
    .single();
  if (error) throw new Error(`Location evidence write failed: ${error.message}`);
  return String(data.id);
}

export async function storeProviderSnapshot(input: {
  locationId?: string | null;
  provider: string;
  providerEntityId?: string | null;
  payload: unknown;
  schemaVersion?: number;
  processingVersion?: number;
}) {
  const { data, error } = await supabaseAdmin
    .from("location_provider_snapshots")
    .insert({
      location_id: input.locationId || null,
      provider: input.provider,
      provider_entity_id: input.providerEntityId || null,
      payload: input.payload ?? {},
      schema_version: input.schemaVersion || 1,
      processing_version: input.processingVersion || 1,
      retrieved_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw new Error(`Provider snapshot write failed: ${error.message}`);
  return String(data.id);
}

export async function reconcileCanonicalFields(input: {
  locationId: string;
  provider: string;
  fields: Record<string, unknown>;
  confidence?: number;
  evidenceType?: LocationEvidenceType;
  sourceRef?: string | null;
}) {
  const { data: location, error } = await supabaseAdmin
    .from("locations")
    .select("*")
    .eq("id", input.locationId)
    .single();
  if (error) throw new Error(`Location reconcile read failed: ${error.message}`);

  const authority = authorityForProvider(input.provider);
  const fieldNames = Object.keys(input.fields);
  const { data: provenanceRows, error: provenanceError } = await supabaseAdmin
    .from("location_field_provenance")
    .select("field_name,authority_source")
    .eq("location_id", input.locationId)
    .in("field_name", fieldNames.length ? fieldNames : ["__none__"]);
  if (provenanceError) throw new Error(`Location provenance read failed: ${provenanceError.message}`);

  const provenance = Object.fromEntries(
    (provenanceRows || []).map((row: any) => [String(row.field_name), row.authority_source as LocationAuthoritySource]),
  );

  const filtered = filterLocationProviderUpdate({
    location: location as Record<string, unknown>,
    update: input.fields,
    incomingSource: authority,
    provenance,
  });

  if (Object.keys(filtered.allowed).length) {
    const { error: updateError } = await supabaseAdmin
      .from("locations")
      .update({ ...filtered.allowed, updated_at: new Date().toISOString() })
      .eq("id", input.locationId);
    if (updateError) throw new Error(`Canonical location update failed: ${updateError.message}`);

    for (const [field, value] of Object.entries(filtered.allowed)) {
      const { error: provenanceWriteError } = await supabaseAdmin.rpc("upsert_location_field_provenance", {
        p_location_id: input.locationId,
        p_field_name: field,
        p_authority_source: authority,
        p_source_ref: input.sourceRef || input.provider,
        p_confidence: input.confidence ?? null,
        p_evidence: { provider: input.provider, value },
        p_observed_at: new Date().toISOString(),
      });
      if (provenanceWriteError) throw new Error(`Location provenance write failed: ${provenanceWriteError.message}`);

      await recordLocationEvidence({
        locationId: input.locationId,
        provider: input.provider,
        evidenceType: input.evidenceType || "classification",
        field,
        value,
        confidence: input.confidence ?? null,
        sourceUrl: input.sourceRef || null,
      });
    }
  }

  return filtered;
}
