import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const JOB = "reservation-sms-phrase-learning";
const PROMOTE_OCCURRENCES = 10;
const PROMOTE_CONFIRMED = 5;
const PROMOTE_CONSISTENCY = 0.95;
const PROMOTE_CONFIDENCE = 0.95;
const DEMOTE_CONSISTENCY = 0.85;
const OUTCOME_WINDOW_MINUTES = 30;

type Observation = {
  id: string;
  raw_text: string;
  learning_cue: string;
  intent: "change_time" | "change_date" | "change_party";
  field_type: "time" | "date" | "party";
  confidence: number | string;
  source: "ai" | "learned";
  outcome: "pending" | "confirmed" | "unconfirmed";
  created_at: string;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Supabase service credentials are required");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function matchOutcome(supabase: any, observation: Observation) {
  const start = new Date(new Date(observation.created_at).getTime() - 2 * 60_000).toISOString();
  const end = new Date(new Date(observation.created_at).getTime() + OUTCOME_WINDOW_MINUTES * 60_000).toISOString();
  const { data: message } = await supabase
    .from("crm_messages")
    .select("id,conversation_id,created_at")
    .eq("direction", "inbound")
    .eq("channel", "sms")
    .eq("body_text", observation.raw_text)
    .gte("created_at", start)
    .lte("created_at", end)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!message?.conversation_id) return null;
  const { data: conversation } = await supabase
    .from("crm_conversations")
    .select("reservation_id")
    .eq("id", message.conversation_id)
    .maybeSingle();
  if (!conversation?.reservation_id) return { messageId: message.id, reservationId: null, confirmed: false };

  const { data: activity } = await supabase
    .from("reservation_activity_logs")
    .select("id,created_at")
    .eq("reservation_id", conversation.reservation_id)
    .eq("action", "customer_sms_rescheduled")
    .gte("created_at", observation.created_at)
    .lte("created_at", end)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return {
    messageId: message.id,
    reservationId: conversation.reservation_id,
    confirmed: Boolean(activity?.id),
    confirmedAt: activity?.created_at || null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  const expected = Deno.env.get("CRON_SECRET");
  const received = req.headers.get("x-cron-secret") || "";
  if (!expected || received !== expected) return json({ success: false, error: "unauthorized" }, 401);

  const supabase = adminClient();
  const startedAt = new Date().toISOString();
  try {
    const cutoff = new Date(Date.now() - OUTCOME_WINDOW_MINUTES * 60_000).toISOString();
    const { data: pending, error: pendingError } = await supabase
      .from("reservation_sms_phrase_observations")
      .select("id,raw_text,learning_cue,intent,field_type,confidence,source,outcome,created_at")
      .eq("outcome", "pending")
      .lte("created_at", cutoff)
      .order("created_at", { ascending: true })
      .limit(250);
    if (pendingError) throw pendingError;

    let confirmedUpdates = 0;
    let unconfirmedUpdates = 0;
    for (const observation of (pending || []) as Observation[]) {
      const matched = await matchOutcome(supabase, observation);
      const confirmed = matched?.confirmed === true;
      const { error } = await supabase
        .from("reservation_sms_phrase_observations")
        .update({
          outcome: confirmed ? "confirmed" : "unconfirmed",
          matched_message_id: matched?.messageId || null,
          matched_reservation_id: matched?.reservationId || null,
          confirmed_at: confirmed ? matched?.confirmedAt || new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", observation.id);
      if (error) throw error;
      if (confirmed) confirmedUpdates += 1;
      else unconfirmedUpdates += 1;
    }

    const since = new Date(Date.now() - 90 * 24 * 60 * 60_000).toISOString();
    const { data: observations, error: observationsError } = await supabase
      .from("reservation_sms_phrase_observations")
      .select("learning_cue,intent,field_type,confidence,outcome,created_at")
      .gte("created_at", since)
      .in("source", ["ai", "learned"])
      .limit(5000);
    if (observationsError) throw observationsError;

    const byCue = new Map<string, any[]>();
    for (const row of observations || []) {
      const cue = String(row.learning_cue || "").trim().toLowerCase();
      if (!cue) continue;
      const bucket = byCue.get(cue) || [];
      bucket.push(row);
      byCue.set(cue, bucket);
    }

    let promoted = 0;
    let demoted = 0;
    let candidates = 0;
    for (const [cue, rows] of byCue.entries()) {
      const variants = new Map<string, any[]>();
      for (const row of rows) {
        const key = `${row.intent}:${row.field_type}`;
        const bucket = variants.get(key) || [];
        bucket.push(row);
        variants.set(key, bucket);
      }
      const dominant = [...variants.entries()].sort((a, b) => b[1].length - a[1].length)[0];
      if (!dominant) continue;
      const [key, dominantRows] = dominant;
      const [intent, fieldType] = key.split(":");
      const occurrences = rows.length;
      const confirmedCount = dominantRows.filter((row) => row.outcome === "confirmed").length;
      const consistency = dominantRows.length / occurrences;
      const avgConfidence = dominantRows.reduce((sum, row) => sum + Number(row.confidence || 0), 0) / dominantRows.length;
      const lastSeenAt = dominantRows.map((row) => row.created_at).sort().at(-1) || null;

      const { data: existing } = await supabase
        .from("reservation_sms_learned_rules")
        .select("id,status")
        .eq("learning_cue", cue)
        .eq("intent", intent)
        .eq("field_type", fieldType)
        .maybeSingle();

      const promotableField = fieldType === "time" || fieldType === "party";
      const shouldPromote = promotableField
        && dominantRows.length >= PROMOTE_OCCURRENCES
        && confirmedCount >= PROMOTE_CONFIRMED
        && consistency >= PROMOTE_CONSISTENCY
        && avgConfidence >= PROMOTE_CONFIDENCE;
      const shouldDemote = existing?.status === "active" && consistency < DEMOTE_CONSISTENCY;
      const nextStatus = shouldPromote ? "active" : shouldDemote ? "disabled" : existing?.status === "active" ? "active" : "candidate";

      const { error: upsertError } = await supabase.from("reservation_sms_learned_rules").upsert({
        learning_cue: cue,
        intent,
        field_type: fieldType,
        status: nextStatus,
        occurrence_count: occurrences,
        confirmed_count: confirmedCount,
        consistency_rate: consistency,
        average_confidence: avgConfidence,
        promoted_at: shouldPromote && existing?.status !== "active" ? new Date().toISOString() : undefined,
        demoted_at: shouldDemote ? new Date().toISOString() : undefined,
        last_seen_at: lastSeenAt,
        updated_at: new Date().toISOString(),
      }, { onConflict: "learning_cue,intent,field_type" });
      if (upsertError) throw upsertError;
      if (shouldPromote && existing?.status !== "active") promoted += 1;
      else if (shouldDemote) demoted += 1;
      else candidates += 1;
    }

    await supabase.from("cron_job_runs").insert({
      job_key: JOB,
      job_name: JOB,
      function_name: JOB,
      source: "edge_function",
      status: "success",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      checked_count: (pending || []).length,
      success_count: confirmedUpdates + promoted,
      skipped_count: unconfirmedUpdates,
      failed_count: 0,
      metadata: { confirmedUpdates, unconfirmedUpdates, promoted, demoted, candidates, cueCount: byCue.size },
    }).catch(() => null);

    return json({ success: true, confirmedUpdates, unconfirmedUpdates, promoted, demoted, candidates, cueCount: byCue.size });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JOB, message);
    return json({ success: false, error: message }, 500);
  }
});
