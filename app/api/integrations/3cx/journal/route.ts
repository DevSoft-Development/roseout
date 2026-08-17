import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { firstText, isThreeCxAuthorized } from "@/lib/integrations/three-cx";

export const dynamic = "force-dynamic";

function cleanDuration(value: unknown) {
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds);
  return null;
}

function durationLabel(seconds: number | null) {
  if (seconds === null) return null;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

export async function POST(request: NextRequest) {
  if (!isThreeCxAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Expected a JSON call journal payload." }, { status: 400 });
  }

  const locationId = firstText(payload, [
    "locationId",
    "location_id",
    "contactId",
    "contact_id",
    "crmContactId",
    "crm_contact_id",
    "entityId",
    "entity_id",
    "requester_id",
  ]);

  if (!locationId) {
    return NextResponse.json({ error: "A CRM location/contact id is required." }, { status: 400 });
  }

  const { data: location, error: locationError } = await supabaseAdmin
    .from("locations")
    .select("id,name,phone")
    .eq("id", locationId)
    .maybeSingle();

  if (locationError) {
    console.error("three_cx_location_resolution_failed", {
      code: locationError.code,
      message: locationError.message,
      locationId,
    });
    return NextResponse.json({ error: "CRM location lookup failed." }, { status: 500 });
  }

  if (!location) {
    return NextResponse.json({ error: "CRM location not found." }, { status: 404 });
  }

  const direction = firstText(payload, ["direction", "callDirection", "call_direction"]) || "external";
  const status = firstText(payload, ["status", "callStatus", "call_status", "result"]) || "completed";
  const from = firstText(payload, ["from", "caller", "callerNumber", "caller_number"]);
  const to = firstText(payload, ["to", "callee", "calledNumber", "called_number", "number"]);
  const agent = firstText(payload, ["agent", "agentName", "agent_name", "extension", "extensionName"]);
  const duration = cleanDuration(payload.durationSeconds ?? payload.duration_seconds ?? payload.duration);
  const externalId = firstText(payload, ["callId", "call_id", "id", "externalId", "external_id"]);

  const summaryParts = [
    `3CX ${direction} call`,
    status ? `status: ${status}` : null,
    durationLabel(duration) ? `duration: ${durationLabel(duration)}` : null,
    agent ? `rep: ${agent}` : null,
    from ? `from: ${from}` : null,
    to ? `to: ${to}` : null,
    externalId ? `call id: ${externalId}` : null,
  ].filter(Boolean);

  const { data: activity, error: insertError } = await supabaseAdmin
    .from("crm_activities")
    .insert({
      location_id: String(location.id),
      activity_type: "phone_call",
      source_system: "3cx",
      summary: summaryParts.join(" · "),
    })
    .select("id")
    .single();

  if (insertError) {
    console.error("three_cx_call_journal_failed", {
      code: insertError.code,
      message: insertError.message,
      locationId,
      externalId,
    });
    return NextResponse.json({ error: "Call could not be saved to CRM activity." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, activityId: activity.id });
}
