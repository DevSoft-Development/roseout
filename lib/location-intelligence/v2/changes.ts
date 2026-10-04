import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { allowPaidMaterialChangeVerification } from "@/lib/location-intelligence/v2/policy";

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
