import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { allowPaidMaterialChangeVerification } from "@/lib/location-intelligence/v2/policy";
import { executeWithProviderFallback } from "@/lib/location-intelligence/v2/orchestrator";
import { isClaimedLocation } from "@/lib/location-intelligence/source-precedence";

export async function enqueueMaterialChange(input: {
  locationId: string;
  changeType: string;
  confidence: number;
  source: string;
  evidence?: Record<string, unknown>;
}) {
  const confidence = Math.max(0, Math.min(1, Number(input.confidence || 0)));
  const { data, error } = await supabaseAdmin
    .from("location_material_change_events")
    .insert({
      location_id: input.locationId,
      change_type: input.changeType,
      confidence,
      source: input.source,
      evidence: input.evidence || {},
      status: "pending",
    })
    .select("*")
    .single();
  if (error) throw new Error(`Material change enqueue failed: ${error.message}`);
  return data;
}

export async function dueMaterialChangeVerifications(limit = 100) {
  const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
  const { data, error } = await supabaseAdmin
    .from("location_material_change_events")
    .select("*,locations!inner(id,is_claimed,claimed,claim_status,owner_user_id)")
    .eq("status", "pending")
    .order("confidence", { ascending: false })
    .order("detected_at", { ascending: true })
    .limit(safeLimit);
  if (error) throw new Error(`Material change queue read failed: ${error.message}`);

  return (data || []).filter((event: any) =>
    allowPaidMaterialChangeVerification({
      location: event.locations || {},
      changeType: String(event.change_type || ""),
      confidence: Number(event.confidence || 0),
    })
  );
}

export async function setMaterialChangeResult(input: {
  eventId: string;
  status: "verifying" | "confirmed" | "dismissed" | "failed";
  evidence?: Record<string, unknown>;
}) {
  const update: Record<string, unknown> = {
    status: input.status,
    updated_at: new Date().toISOString(),
  };
  if (input.evidence) update.evidence = input.evidence;
  if (input.status === "confirmed" || input.status === "dismissed") {
    update.verified_at = new Date().toISOString();
  }

  const { data, error } = await supabaseAdmin
    .from("location_material_change_events")
    .update(update)
    .eq("id", input.eventId)
    .select("*")
    .single();
  if (error) throw new Error(`Material change result update failed: ${error.message}`);
  return data;
}


function verificationDecision(changeType: string, data: unknown): "confirmed" | "dismissed" | "verifying" {
  const record = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const businessStatus = String(
    record.businessStatus ||
    record.business_status ||
    ((record.place && typeof record.place === "object") ? (record.place as Record<string, unknown>).businessStatus : "") ||
    "",
  ).toUpperCase();

  if (changeType === "permanently_closed") {
    if (businessStatus.includes("CLOSED_PERMANENT")) return "confirmed";
    if (businessStatus.includes("OPERATIONAL")) return "dismissed";
  }
  if (changeType === "temporarily_closed") {
    if (businessStatus.includes("CLOSED_TEMPORAR")) return "confirmed";
    if (businessStatus.includes("OPERATIONAL")) return "dismissed";
  }
  if (changeType === "reopened" && businessStatus.includes("OPERATIONAL")) return "confirmed";
  return "verifying";
}

export async function verifyMaterialChangeEvent(eventId: string) {
  const { data: event, error: eventError } = await supabaseAdmin
    .from("location_material_change_events")
    .select("*")
    .eq("id", eventId)
    .single();
  if (eventError) throw new Error(`Material change event read failed: ${eventError.message}`);
  if (!event?.location_id) throw new Error("material_change_location_required");

  const [{ data: location, error: locationError }, { data: googleIdentity, error: identityError }] = await Promise.all([
    supabaseAdmin
      .from("locations")
      .select("id,name,restaurant_name,activity_name,address,city,state,website,is_claimed,claimed,claim_status,owner_user_id")
      .eq("id", event.location_id)
      .single(),
    supabaseAdmin
      .from("location_external_identities")
      .select("external_id")
      .eq("location_id", event.location_id)
      .eq("provider", "google")
      .eq("status", "active")
      .eq("is_current", true)
      .maybeSingle(),
  ]);
  if (locationError) throw new Error(locationError.message);
  if (identityError) throw new Error(identityError.message);

  const ownerMaintained = isClaimedLocation(location as Record<string, unknown>);
  const name = String(location.name || location.restaurant_name || location.activity_name || "").trim();
  const query = [name, location.address, location.city, location.state].filter(Boolean).join(", ");

  await setMaterialChangeResult({ eventId, status: "verifying" });

  try {
    const result = await executeWithProviderFallback({
      capability: "status_verification",
      purpose: "material_change",
      ownerMaintained,
      input: {
        googlePlaceId: googleIdentity?.external_id || null,
        placeId: googleIdentity?.external_id || null,
        url: location.website || null,
        query,
        title: name,
        description: query,
        limit: 10,
      },
    });
    const decision = verificationDecision(String(event.change_type || ""), result.data);
    return setMaterialChangeResult({
      eventId,
      status: decision,
      evidence: {
        ...(event.evidence && typeof event.evidence === "object" ? event.evidence : {}),
        verificationProvider: result.providerId,
        verificationData: result.data,
        verifiedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    await setMaterialChangeResult({
      eventId,
      status: "failed",
      evidence: {
        ...(event.evidence && typeof event.evidence === "object" ? event.evidence : {}),
        verificationError: error instanceof Error ? error.message : "material_change_verification_failed",
      },
    });
    throw error;
  }
}

export async function processMaterialChangeVerificationBatch(limit = 25) {
  const due = await dueMaterialChangeVerifications(limit);
  const results: Array<Record<string, unknown>> = [];
  for (const event of due as Array<Record<string, any>>) {
    try {
      results.push(await verifyMaterialChangeEvent(String(event.id)));
    } catch (error) {
      results.push({
        id: event.id,
        locationId: event.location_id,
        error: error instanceof Error ? error.message : "material_change_verification_failed",
      });
    }
  }
  return {
    processed: results.length,
    failed: results.filter((row) => Boolean(row.error)).length,
    results,
  };
}
