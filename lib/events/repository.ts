import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCanonicalEvent } from "./normalization";
import type { CanonicalEventInput, NormalizedEvent } from "./types";

export type CanonicalEventUpsertAction = "inserted" | "updated" | "deduped";

function eventRow(event: NormalizedEvent) {
  return {
    organization_id: event.organizationId ?? null,
    location_id: event.locationId ?? null,
    source_kind: event.sourceKind,
    title: event.title,
    description: event.description ?? null,
    category: event.category ?? null,
    subcategory: event.subcategory ?? null,
    venue_name: event.venueName ?? null,
    address: event.address ?? null,
    city: event.city ?? null,
    state: event.state ?? null,
    zip_code: event.zipCode ?? null,
    market: event.market ?? null,
    borough: event.borough ?? null,
    county: event.county ?? null,
    latitude: event.latitude ?? null,
    longitude: event.longitude ?? null,
    starts_at: event.startsAt,
    ends_at: event.endsAt ?? null,
    timezone: event.timezone,
    all_day: event.allDay,
    price_min: event.priceMin ?? null,
    price_max: event.priceMax ?? null,
    currency: event.currency ?? null,
    is_free: event.isFree ?? false,
    external_url: event.externalUrl ?? null,
    image_url: event.imageUrl ?? null,
    status: event.status,
    searchable: event.searchable,
    dedupe_fingerprint: event.dedupeFingerprint,
    search_document: event.searchDocument,
    metadata: event.metadata ?? {},
    updated_at: new Date().toISOString(),
  };
}

export async function upsertCanonicalEvent(supabase: SupabaseClient, rawInput: CanonicalEventInput) {
  const event = normalizeCanonicalEvent(rawInput);

  const { data: existingSource, error: sourceLookupError } = await supabase
    .from("event_sources")
    .select("event_id")
    .eq("provider", event.provider)
    .eq("provider_event_id", event.providerEventId)
    .maybeSingle();
  if (sourceLookupError) throw sourceLookupError;

  let eventId = existingSource?.event_id ? String(existingSource.event_id) : null;
  let action: CanonicalEventUpsertAction = existingSource?.event_id ? "updated" : "inserted";

  if (!eventId) {
    const { data: existingEvent, error: fingerprintLookupError } = await supabase
      .from("events")
      .select("id,source_kind")
      .eq("dedupe_fingerprint", event.dedupeFingerprint)
      .maybeSingle();
    if (fingerprintLookupError) throw fingerprintLookupError;
    eventId = existingEvent?.id ? String(existingEvent.id) : null;
    if (eventId) action = "deduped";
  }

  if (eventId) {
    const { data: current, error: currentError } = await supabase
      .from("events")
      .select("source_kind")
      .eq("id", eventId)
      .single();
    if (currentError) throw currentError;

    // Native organizer-authored canonical data is not overwritten by a provider refresh.
    if (current?.source_kind !== "native" || event.sourceKind === "native") {
      const { error: updateError } = await supabase.from("events").update(eventRow(event)).eq("id", eventId);
      if (updateError) throw updateError;
    }
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from("events")
      .insert(eventRow(event))
      .select("id")
      .single();
    if (insertError) throw insertError;
    eventId = String(inserted.id);
    action = "inserted";
  }

  const now = new Date().toISOString();
  const { error: sourceUpsertError } = await supabase.from("event_sources").upsert(
    {
      event_id: eventId,
      provider: event.provider,
      provider_event_id: event.providerEventId,
      source_url: event.sourceUrl ?? event.externalUrl ?? null,
      provider_payload: event.providerPayload ?? {},
      provider_updated_at: event.providerUpdatedAt ?? null,
      last_seen_at: now,
      updated_at: now,
    },
    { onConflict: "provider,provider_event_id" },
  );
  if (sourceUpsertError) throw sourceUpsertError;

  return { eventId, dedupeFingerprint: event.dedupeFingerprint, action };
}

export async function upsertCanonicalEvents(supabase: SupabaseClient, inputs: CanonicalEventInput[]) {
  const succeeded: Array<{
    eventId: string;
    dedupeFingerprint: string;
    action: CanonicalEventUpsertAction;
  }> = [];
  const failed: Array<{ provider: string; providerEventId: string; reason: string }> = [];

  for (const input of inputs) {
    try {
      succeeded.push(await upsertCanonicalEvent(supabase, input));
    } catch (error) {
      failed.push({
        provider: input.provider,
        providerEventId: input.providerEventId,
        reason: error instanceof Error ? error.message : "Unknown event upsert failure",
      });
    }
  }

  return { succeeded, failed };
}
