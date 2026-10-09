import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { firstText, isThreeCxAuthorized, normalizePhone } from "@/lib/integrations/three-cx";

export const dynamic = "force-dynamic";

function cleanDuration(value: unknown) {
  if (typeof value === "string" && /^\d{1,3}:\d{2}:\d{2}$/.test(value.trim())) {
    const [hours, minutes, seconds] = value.trim().split(":").map(Number);
    return Math.max(0, Math.round(hours * 3600 + minutes * 60 + seconds));
  }
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

function stableJournalId(payload: Record<string, unknown>, locationId: string) {
  const supplied = firstText(payload, ["callId", "call_id", "id", "externalId", "external_id"]);
  if (supplied) return supplied;

  const start = firstText(payload, [
    "callStartUtcMillis",
    "call_start_utc_millis",
    "startUtcMillis",
    "start_utc_millis",
    "callStartTimeUTC",
    "call_start_time_utc",
  ]);
  const agent = firstText(payload, ["agent", "agentName", "agent_name", "extension", "extensionName"]) || "unknown-agent";
  const number = firstText(payload, ["number", "externalNumber", "external_number", "to", "from"]) || "unknown-number";
  const callType = firstText(payload, ["callType", "call_type", "status", "result"]) || "unknown-type";
  if (!start) return null;
  return `3cx:${locationId}:${start}:${agent}:${normalizePhone(number)}:${callType}`;
}

async function findInitiatedActivity(db: any, locationId: string, externalNumber: string | null) {
  const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  let query = db
    .from("crm_activities")
    .select("id,metadata,created_at")
    .eq("location_id", locationId)
    .eq("source_system", "3cx")
    .eq("activity_type", "phone_call")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(10);

  const { data, error } = await query;
  if (error) return null;
  const normalizedExternal = normalizePhone(externalNumber);
  return (data || []).find((row: any) => {
    const metadata = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
    if (String(metadata.state || "") !== "initiated") return false;
    if (!normalizedExternal) return true;
    return normalizePhone(metadata.dialPhone || metadata.to || "") === normalizedExternal;
  }) || null;
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

  const db = getThreeCxDatabase();
  const { data: location, error: locationError } = await db
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

  const callType = firstText(payload, ["callType", "call_type"]);
  const direction = firstText(payload, ["direction", "callDirection", "call_direction"])
    || (callType === "Inbound" || callType === "Missed" ? "Inbound" : callType === "Outbound" || callType === "Notanswered" ? "Outbound" : "external");
  const status = firstText(payload, ["status", "callStatus", "call_status", "result"]) || callType || "completed";
  const externalNumber = firstText(payload, ["number", "externalNumber", "external_number"]);
  const from = firstText(payload, ["from", "caller", "callerNumber", "caller_number"])
    || (direction.toLowerCase() === "inbound" ? externalNumber : null);
  const to = firstText(payload, ["to", "callee", "calledNumber", "called_number"])
    || (direction.toLowerCase() === "outbound" ? externalNumber : null);
  const agent = firstText(payload, ["agent", "agentName", "agent_name", "extension", "extensionName"]);
  const duration = cleanDuration(payload.durationSeconds ?? payload.duration_seconds ?? payload.duration);
  const callStartUtcMillis = firstText(payload, ["callStartUtcMillis", "call_start_utc_millis", "startUtcMillis", "start_utc_millis"]);
  const callEndUtcMillis = firstText(payload, ["callEndUtcMillis", "call_end_utc_millis", "endUtcMillis", "end_utc_millis"]);
  const recordingUrl = firstText(payload, ["recordingUrl", "recording_url"]);
  const transcription = firstText(payload, ["transcription"]);
  const callSummary = firstText(payload, ["summary", "callSummary", "call_summary"]);
  const externalId = stableJournalId(payload, String(location.id));

  const summaryParts = [
    `3CX ${direction} call`,
    status ? `status: ${status}` : null,
    durationLabel(duration) ? `duration: ${durationLabel(duration)}` : null,
    agent ? `rep: ${agent}` : null,
    from ? `from: ${from}` : null,
    to ? `to: ${to}` : null,
    externalId ? `call id: ${externalId}` : null,
  ].filter(Boolean);

  if (externalId) {
    const { data: existing, error: existingError } = await db
      .from("crm_activities")
      .select("id")
      .eq("source_system", "3cx")
      .eq("source_record_id", externalId)
      .maybeSingle();
    if (existingError) {
      console.error("three_cx_call_journal_dedupe_failed", { locationId, externalId, message: existingError.message });
    } else if (existing?.id) {
      return NextResponse.json({ ok: true, activityId: existing.id, duplicate: true });
    }
  }

  const metadata = {
    state: "completed",
    callType,
    direction,
    status,
    durationSeconds: duration,
    from,
    to,
    number: externalNumber,
    agent,
    callStartUtcMillis,
    callEndUtcMillis,
    recordingUrl,
    transcription,
    summary: callSummary,
  };

  const initiated = await findInitiatedActivity(db, String(location.id), externalNumber || to || from);
  let activityId: string | null = null;

  if (initiated?.id) {
    const { data: updated, error: updateError } = await db
      .from("crm_activities")
      .update({
        direction: direction.toLowerCase(),
        channel: "phone",
        summary: summaryParts.join(" · "),
        body: callSummary || transcription || null,
        source_record_id: externalId,
        metadata,
      })
      .eq("id", initiated.id)
      .select("id")
      .single();
    if (updateError) {
      console.error("three_cx_call_journal_update_failed", { locationId, externalId, message: updateError.message });
    } else {
      activityId = updated.id;
    }
  }

  if (!activityId) {
    const { data: activity, error: insertError } = await db
      .from("crm_activities")
      .insert({
        location_id: String(location.id),
        activity_type: "phone_call",
        direction: direction.toLowerCase(),
        channel: "phone",
        source_system: "3cx",
        source_table: "3cx_report_call",
        source_record_id: externalId,
        summary: summaryParts.join(" · "),
        body: callSummary || transcription || null,
        metadata,
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
    activityId = activity.id;
  }

  const { error: communicationError } = await db.from("communication_logs").insert({
    channel: "phone",
    direction: direction.toLowerCase(),
    from_address: from,
    to_address: to || externalNumber,
    recipient_type: "location",
    recipient_id: String(location.id),
    subject: `3CX ${callType || direction} call`,
    body: summaryParts.join(" · "),
    status,
    provider_message_id: externalId,
    metadata: {
      source_system: "crm_3cx",
      source_table: "crm_activities",
      crm_activity_id: activityId,
      ...metadata,
    },
  });
  if (communicationError && !/duplicate/i.test(communicationError.message || "")) {
    console.warn("three_cx_call_communication_log_failed", {
      locationId,
      externalId,
      message: communicationError.message,
    });
  }

  return NextResponse.json({ ok: true, activityId, mergedInitiated: Boolean(initiated?.id), externalId });
}

function getThreeCxDatabase() {
  return supabaseAdmin;
}
