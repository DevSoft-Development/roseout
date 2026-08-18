import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

type Row = Record<string, any>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type,x-worker-secret,x-support-operation",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const url = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const workerSecret = Deno.env.get("WORKER_INTERNAL_SECRET") ?? "";
const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
  if (!secureCompare(request.headers.get("x-worker-secret") ?? "", workerSecret)) return json({ success: false, error: "Unauthorized" }, 401);

  try {
    const body = await request.json().catch(() => ({}));
    const operation = String(body.operation || request.headers.get("x-support-operation") || "run");
    const limit = clamp(body.limit, 100, 1, 500);
    if (operation === "route") return json({ success: true, operation, ...(await routeTickets(limit)) });
    if (operation === "sla") return json({ success: true, operation, ...(await enforceSla(limit)) });
    if (operation === "auto_close") return json({ success: true, operation, ...(await autoCloseResolved(limit)) });
    if (operation === "run") {
      const routed = await routeTickets(limit);
      const sla = await enforceSla(limit);
      const closed = await autoCloseResolved(limit);
      return json({ success: true, operation, routed, sla, closed });
    }
    return json({ success: false, error: "Unsupported operation" }, 400);
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

async function routeTickets(limit: number) {
  const { data, error } = await supabase
    .from("support_tickets")
    .select("*")
    .is("assigned_group", null)
    .in("status", ["new", "open", "reopened"])
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;

  let updated = 0;
  for (const ticket of (data ?? []) as Row[]) {
    const category = String(ticket.category || ticket.topic || "").toLowerCase();
    const source = String(ticket.source || "").toLowerCase();
    const group = category.includes("billing")
      ? "billing"
      : category.includes("reservation")
        ? "reservations"
        : category.includes("technical") || category.includes("website") || category.includes("domain") || category.includes("bug")
          ? "technical_support"
          : source.includes("location") || ticket.location_id
            ? "location_success"
            : "customer_support";
    const priority = category.includes("account access") || category.includes("payment") ? "high" : ticket.priority || "normal";
    const now = new Date();
    const firstResponseMinutes = priority === "urgent" ? 15 : priority === "high" ? 60 : 240;
    const resolutionHours = priority === "urgent" ? 4 : priority === "high" ? 12 : priority === "low" ? 72 : 24;
    const patch = {
      assigned_group: group,
      priority,
      sla_first_response_due_at: ticket.sla_first_response_due_at || new Date(now.getTime() + firstResponseMinutes * 60_000).toISOString(),
      sla_resolution_due_at: ticket.sla_resolution_due_at || new Date(now.getTime() + resolutionHours * 3_600_000).toISOString(),
      updated_at: now.toISOString(),
    };
    const { error: updateError } = await supabase.from("support_tickets").update(patch).eq("id", ticket.id);
    if (updateError) throw updateError;
    updated += 1;
  }
  return { scanned: data?.length || 0, updated };
}

async function enforceSla(limit: number) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("support_tickets")
    .select("*")
    .not("status", "in", "(resolved,closed)")
    .or(`and(first_response_at.is.null,sla_first_response_due_at.lt.${now}),sla_resolution_due_at.lt.${now}`)
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (error) throw error;

  let escalated = 0;
  for (const ticket of (data ?? []) as Row[]) {
    const metadata = isObject(ticket.metadata) ? ticket.metadata : {};
    const firstResponseBreached = !ticket.first_response_at && ticket.sla_first_response_due_at && ticket.sla_first_response_due_at < now;
    const resolutionBreached = ticket.sla_resolution_due_at && ticket.sla_resolution_due_at < now;
    const patch = {
      status: "escalated",
      priority: ticket.priority === "urgent" ? "urgent" : "high",
      escalated_at: ticket.escalated_at || now,
      updated_at: now,
      metadata: { ...metadata, sla_breached: true, first_response_breached: Boolean(firstResponseBreached), resolution_breached: Boolean(resolutionBreached), sla_breached_at: now },
    };
    const { error: updateError } = await supabase.from("support_tickets").update(patch).eq("id", ticket.id);
    if (updateError) throw updateError;
    await supabase.from("support_ticket_messages").insert({
      ticket_id: ticket.id,
      actor_type: "system",
      sender_role: "system",
      body: "SLA threshold breached. Ticket escalated automatically.",
      message: "SLA threshold breached. Ticket escalated automatically.",
      internal_note: true,
      direction: "internal",
      metadata: { event: "sla_breach", first_response_breached: Boolean(firstResponseBreached), resolution_breached: Boolean(resolutionBreached) },
    });
    escalated += 1;
  }
  return { scanned: data?.length || 0, escalated };
}

async function autoCloseResolved(limit: number) {
  const cutoff = new Date(Date.now() - 5 * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("support_tickets")
    .select("id,resolved_at,status")
    .eq("status", "resolved")
    .lt("resolved_at", cutoff)
    .limit(limit);
  if (error) throw error;

  let closed = 0;
  for (const ticket of data ?? []) {
    const now = new Date().toISOString();
    const { error: updateError } = await supabase.from("support_tickets").update({ status: "closed", closed_at: now, updated_at: now }).eq("id", ticket.id);
    if (updateError) throw updateError;
    await supabase.from("support_ticket_messages").insert({ ticket_id: ticket.id, actor_type: "system", sender_role: "system", body: "Ticket automatically closed after remaining resolved for five days.", message: "Ticket automatically closed after remaining resolved for five days.", internal_note: true, direction: "internal", metadata: { event: "auto_closed" } });
    closed += 1;
  }
  return { scanned: data?.length || 0, closed };
}

function isObject(value: unknown): value is Row {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clamp(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.trunc(parsed))) : fallback;
}

function secureCompare(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
