import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

export type ExternalIdentityProvider =
  | "google"
  | "dataforseo"
  | "mapbox"
  | "website"
  | "owner"
  | "other";

export async function resolveTohLocationByExternalIdentity(
  provider: ExternalIdentityProvider,
  externalId: string,
) {
  const value = String(externalId || "").trim();
  if (!value) return null;

  const { data, error } = await supabaseAdmin
    .from("location_external_identities")
    .select("location_id,status,is_current")
    .eq("provider", provider)
    .eq("external_id", value)
    .maybeSingle();

  if (error) throw new Error(`External identity lookup failed: ${error.message}`);
  return data?.location_id ? String(data.location_id) : null;
}

export async function attachExternalIdentity(input: {
  locationId: string;
  provider: ExternalIdentityProvider;
  externalId: string;
  isCurrent?: boolean;
  metadata?: Record<string, unknown>;
}) {
  const value = String(input.externalId || "").trim();
  if (!value) throw new Error("external_identity_required");

  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("location_external_identities")
    .select("location_id")
    .eq("provider", input.provider)
    .eq("external_id", value)
    .maybeSingle();
  if (lookupError) throw new Error(`External identity preflight failed: ${lookupError.message}`);
  if (existing?.location_id && String(existing.location_id) !== input.locationId) {
    throw new Error("external_identity_already_attached");
  }

  const { error } = await supabaseAdmin
    .from("location_external_identities")
    .upsert(
      {
        location_id: input.locationId,
        provider: input.provider,
        external_id: value,
        status: "active",
        is_current: input.isCurrent ?? true,
        last_seen_at: new Date().toISOString(),
        metadata: input.metadata || {},
      },
      { onConflict: "provider,external_id" },
    );
  if (error) throw new Error(`External identity attach failed: ${error.message}`);
}

export async function resolveGoogleFirst(input: {
  googlePlaceId?: string | null;
  provider?: ExternalIdentityProvider;
  providerExternalId?: string | null;
}) {
  if (input.googlePlaceId) {
    const google = await resolveTohLocationByExternalIdentity("google", input.googlePlaceId);
    if (google) return { locationId: google, reason: "google_place_id" as const };
  }
  if (input.provider && input.providerExternalId) {
    const provider = await resolveTohLocationByExternalIdentity(input.provider, input.providerExternalId);
    if (provider) return { locationId: provider, reason: "provider_external_id" as const };
  }
  return null;
}
