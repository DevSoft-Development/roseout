import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

type Row = Record<string, any>;
const JOB = "support-learning-worker";
const PROMOTE_SUCCESSES = 5;
const PROMOTE_CONFIDENCE = 0.95;
const DISABLE_CONFIDENCE = 0.85;
const LOOKBACK_DAYS = 90;
const url = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const workerSecret = Deno.env.get("WORKER_INTERNAL_SECRET") ?? "";
const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok");
  if (request.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
  if (!secureCompare(request.headers.get("x-worker-secret") ?? "", workerSecret)) return json({ success: false, error: "Unauthorized" }, 401);
  const startedAt = new Date().toISOString();
  try {
    const body = await request.json().catch(() => ({}));
    const limit = clamp(body.limit, 250, 1, 500);
    const learned = await learnFromResolvedAiReplies(limit);
    const failures = await evaluateLearnedFailures(limit);
    await logRun(startedAt, learned, failures);
    return json({ success: true, learned, failures });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JOB, message);
    return json({ success: false, error: message }, 500);
  }
});

async function learnFromResolvedAiReplies(limit: number) {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString();
  const { data, error } = await supabase.from("support_ticket_messages")
    .select("id,ticket_id,body,created_at,metadata")
    .eq("direction", "outbound").eq("actor_type", "system")
    .contains("metadata", { ai_generated: true, ai_action: "reply" })
    .gte("created_at", since).order("created_at", { ascending: true }).limit(limit);
  if (error) throw error;
  const aiMessages = (data || []).filter((m: Row) => String(m.metadata?.ai_model || "") !== "learned");
  if (!aiMessages.length) return { scanned: 0, accepted: 0, promoted: 0, skipped: 0 };

  const ticketIds = [...new Set(aiMessages.map((m: Row) => String(m.ticket_id)).filter(Boolean))];
  const [{ data: tickets, error: ticketError }, { data: timeline, error: timelineError }] = await Promise.all([
    supabase.from("support_tickets").select("id,status,category,priority").in("id", ticketIds),
    supabase.from("support_ticket_messages").select("ticket_id,actor_type,direction,body,created_at").in("ticket_id", ticketIds).order("created_at", { ascending: true }),
  ]);
  if (ticketError) throw ticketError;
  if (timelineError) throw timelineError;
  const ticketById = new Map((tickets || []).map((t: Row) => [String(t.id), t]));
  const messagesByTicket = new Map<string, Row[]>();
  for (const m of timeline || []) { const k = String(m.ticket_id); messagesByTicket.set(k, [...(messagesByTicket.get(k) || []), m as Row]); }

  let accepted = 0, promoted = 0, skipped = 0;
  for (const ai of aiMessages as Row[]) {
    const ticket = ticketById.get(String(ai.ticket_id));
    if (!ticket || !["resolved", "closed"].includes(String(ticket.status))) { skipped++; continue; }
    const sourceIds = Array.isArray(ai.metadata?.ai_source_article_ids) ? ai.metadata.ai_source_article_ids.map(String).filter(Boolean).sort() : [];
    if (!sourceIds.length) { skipped++; continue; }
    const rows = messagesByTicket.get(String(ai.ticket_id)) || [];
    const aiTime = new Date(String(ai.created_at)).getTime();
    if (rows.some((m) => m.actor_type === "admin" && new Date(String(m.created_at)).getTime() > aiTime)) { skipped++; continue; }
    const inbound = [...rows].reverse().find((m) => m.direction === "inbound" && new Date(String(m.created_at)).getTime() < aiTime && String(m.body || "").trim());
    if (!inbound) { skipped++; continue; }
    const question = normalize(String(inbound.body));
    const answer = String(ai.body || "").trim().slice(0, 900);
    if (question.length < 4 || !answer) { skipped++; continue; }
    const signature = sourceIds.join(",");
    const { data: existing, error: existingError } = await supabase.from("support_learned_responses").select("*")
      .eq("normalized_question", question).eq("source_signature", signature).maybeSingle();
    if (existingError) throw existingError;
    const examples = Array.isArray(existing?.example_ticket_ids) ? existing.example_ticket_ids.map(String) : [];
    if (examples.includes(String(ai.ticket_id))) { skipped++; continue; }
    const successCount = Number(existing?.success_count || 0) + 1;
    const failureCount = Number(existing?.failure_count || 0);
    const confidence = successCount / Math.max(1, successCount + failureCount);
    const active = successCount >= PROMOTE_SUCCESSES && confidence >= PROMOTE_CONFIDENCE;
    const now = new Date().toISOString();
    const { error: upsertError } = await supabase.from("support_learned_responses").upsert({
      normalized_question: question,
      source_signature: signature,
      response_text: existing?.response_text || answer,
      category: String(ticket.category || "General Support").slice(0, 80),
      priority: ["low", "normal", "high", "urgent"].includes(String(ticket.priority)) ? ticket.priority : "normal",
      source_article_ids: sourceIds,
      status: active ? "active" : (existing?.status === "active" ? "active" : "candidate"),
      success_count: successCount,
      failure_count: failureCount,
      confidence,
      example_ticket_ids: [...new Set([...examples, String(ai.ticket_id)])].slice(-50),
      first_seen_at: existing?.first_seen_at || ai.created_at || now,
      last_seen_at: ai.created_at || now,
      promoted_at: active ? existing?.promoted_at || now : existing?.promoted_at || null,
      disabled_at: active ? null : existing?.disabled_at || null,
      updated_at: now,
    }, { onConflict: "normalized_question,source_signature" });
    if (upsertError) throw upsertError;
    accepted++;
    if (active && existing?.status !== "active") promoted++;
  }
  return { scanned: aiMessages.length, accepted, promoted, skipped };
}

async function evaluateLearnedFailures(limit: number) {
  const { data, error } = await supabase.from("support_ticket_messages")
    .select("ticket_id,metadata").eq("direction", "outbound")
    .contains("metadata", { ai_model: "learned" }).order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  const learnedMessages = data || [];
  if (!learnedMessages.length) return { scanned: 0, failures: 0, disabled: 0 };
  const ticketIds = [...new Set(learnedMessages.map((m: Row) => String(m.ticket_id)).filter(Boolean))];
  const { data: tickets, error: ticketError } = await supabase.from("support_tickets").select("id,status").in("id", ticketIds);
  if (ticketError) throw ticketError;
  const statusByTicket = new Map((tickets || []).map((t: Row) => [String(t.id), String(t.status)]));
  let failures = 0, disabled = 0;
  for (const message of learnedMessages as Row[]) {
    if (!["escalated", "reopened"].includes(statusByTicket.get(String(message.ticket_id)) || "")) continue;
    const reason = String(message.metadata?.ai_reason || "");
    const responseId = reason.startsWith("learned_response:") ? reason.slice("learned_response:".length) : "";
    if (!responseId) continue;
    const { data: row, error: rowError } = await supabase.from("support_learned_responses").select("*").eq("id", responseId).maybeSingle();
    if (rowError) throw rowError;
    if (!row) continue;
    const failureTickets = Array.isArray(row.failure_ticket_ids) ? row.failure_ticket_ids.map(String) : [];
    if (failureTickets.includes(String(message.ticket_id))) continue;
    const failureCount = Number(row.failure_count || 0) + 1;
    const successCount = Number(row.success_count || 0);
    const confidence = successCount / Math.max(1, successCount + failureCount);
    const shouldDisable = failureCount >= 2 || confidence < DISABLE_CONFIDENCE;
    const now = new Date().toISOString();
    const { error: updateError } = await supabase.from("support_learned_responses").update({
      failure_count: failureCount,
      confidence,
      failure_ticket_ids: [...new Set([...failureTickets, String(message.ticket_id)])].slice(-50),
      status: shouldDisable ? "disabled" : row.status,
      disabled_at: shouldDisable ? now : row.disabled_at,
      updated_at: now,
    }).eq("id", responseId);
    if (updateError) throw updateError;
    failures++;
    if (shouldDisable && row.status !== "disabled") disabled++;
  }
  return { scanned: learnedMessages.length, failures, disabled };
}

async function logRun(startedAt: string, learned: Row, failures: Row) {
  await supabase.from("cron_job_runs").insert({
    job_key: JOB, job_name: JOB, function_name: JOB, source: "edge_function", status: "success",
    started_at: startedAt, finished_at: new Date().toISOString(), completed_at: new Date().toISOString(),
    checked_count: Number(learned.scanned || 0) + Number(failures.scanned || 0),
    success_count: Number(learned.accepted || 0), skipped_count: Number(learned.skipped || 0), failed_count: 0,
    metadata: { learned, failures },
  }).catch(() => null);
}

function normalize(input: string) { return input.toLowerCase().replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, " <email> ").replace(/\+?1?[\s().-]*(?:\d[\s().-]*){10,}/g, " <phone> ").replace(/\b\d{5,}\b/g, " <number> ").replace(/[^a-z0-9<>\s]/g, " ").replace(/\s+/g, " ").trim().slice(0, 500); }
function clamp(value: unknown, fallback: number, min: number, max: number) { const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback; }
function secureCompare(left: string, right: string) { if (!left || !right || left.length !== right.length) return false; let d = 0; for (let i = 0; i < left.length; i++) d |= left.charCodeAt(i) ^ right.charCodeAt(i); return d === 0; }
function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }
