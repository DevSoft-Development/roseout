import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } }); }
function csvEscape(value: unknown) { const raw = value == null ? "" : String(value); return /[",\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw; }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const name = new URL(import.meta.url).pathname.split("/").at(-2) || "";
  try {
    if (name === "reverse-geocode" || name === "geocode-address") {
      const body = await req.json();
      const key = Deno.env.get("GOOGLE_MAPS_API_KEY");
      if (!key) return json({ provider: "manual_fallback", formattedAddress: body.address || `near ${body.lat}, ${body.lng}` });
      const endpoint = name === "reverse-geocode"
        ? `https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(body.lat)},${encodeURIComponent(body.lng)}&key=${key}`
        : `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(body.address)}&key=${key}`;
      const response = await fetch(endpoint); const data = await response.json(); const first = data.results?.[0];
      return json({ provider: "google", formattedAddress: first?.formatted_address || null, lat: first?.geometry?.location?.lat || null, lng: first?.geometry?.location?.lng || null, placeId: first?.place_id || null, placeName: first?.address_components?.[0]?.long_name || null });
    }

    if (name === "nightly-demo-reset") {
      const started = new Date().toISOString();
      const { data: expired } = await supabase.from("crm_demo_sessions").select("id").eq("status", "active").lt("expires_at", new Date().toISOString());
      const ids = (expired || []).map((row) => row.id);
      for (const id of ids) await supabase.rpc("reset_demo_session", { p_demo_session_id: id });
      await supabase.from("crm_demo_reset_logs").insert({ reset_type: "nightly_expired_sessions", status: "success", sessions_deleted: ids.length, records_deleted: { crm_demo_sessions: ids.length }, started_at: started, finished_at: new Date().toISOString() });
      return json({ success: true, sessionsReset: ids.length });
    }

    if (name === "team-session-watchdog") {
      const threshold = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase.from("team_work_sessions").update({ status: "needs_correction", approval_status: "needs_correction", admin_notes: "Session was open longer than 12 hours.", updated_at: new Date().toISOString() }).eq("status", "active").lt("clock_in_at", threshold).select("id");
      return json({ success: true, sessionsFlagged: data?.length || 0, note: "Support ticket sessions are not flagged for missing proof or location." });
    }

    if (name === "export-team-payroll") {
      const body = await req.json().catch(() => ({}));
      const start = body.payPeriodStart; const end = body.payPeriodEnd;
      if (!start || !end) return json({ error: "payPeriodStart and payPeriodEnd are required." }, 400);
      let query = supabase.from("team_work_sessions").select("*, team_member_profiles!inner(include_in_payroll,hourly_rate,team_type)").eq("approval_status", "approved").gte("clock_in_at", start).lte("clock_in_at", `${end}T23:59:59.999Z`).eq("team_member_profiles.include_in_payroll", true);
      if (!body.force) query = query.is("exported_at", null);
      if (!body.includeTraining) query = query.eq("is_training", false).eq("is_demo", false);
      const { data: sessions, error } = await query; if (error) throw error;
      const ids = (sessions || []).map((s) => s.id);
      const totalMinutes = (sessions || []).reduce((n, s) => n + Number(s.total_minutes || 0), 0);
      const totalPay = (sessions || []).reduce((n, s) => n + (Number(s.total_minutes || 0) / 60) * Number(s.team_member_profiles?.hourly_rate || 0) + Number(s.reimbursement_amount || 0), 0);
      const { data: batch } = await supabase.from("team_payroll_batches").insert({ pay_period_start: start, pay_period_end: end, total_team_members: new Set((sessions || []).map((s) => s.team_member_id)).size, total_approved_hours: totalMinutes / 60, total_paid_travel_hours: (sessions || []).reduce((n,s)=>n+Number(s.paid_travel_minutes||0),0)/60, total_estimated_pay: totalPay }).select("*").single();
      if (batch) await supabase.from("team_payroll_batch_items").insert((sessions || []).map((s) => ({ payroll_batch_id: batch.id, team_member_id: s.team_member_id, user_id: s.user_id, work_session_id: s.id, approved_minutes: s.total_minutes || 0, paid_travel_minutes: s.paid_travel_minutes || 0, mileage: s.mileage || 0, reimbursement_amount: s.reimbursement_amount || 0, hourly_rate: s.team_member_profiles?.hourly_rate || null, gross_pay: (Number(s.total_minutes || 0) / 60) * Number(s.team_member_profiles?.hourly_rate || 0), total_pay: (Number(s.total_minutes || 0) / 60) * Number(s.team_member_profiles?.hourly_rate || 0) + Number(s.reimbursement_amount || 0) })));
      if (ids.length && batch) await supabase.from("team_work_sessions").update({ payroll_batch_id: batch.id, exported_at: new Date().toISOString(), status: "exported" }).in("id", ids);
      const summaryRows = [["team_member_id","team_type","approved_hours","hourly_rate","total_pay"], ...(sessions || []).map((s) => [s.team_member_id, s.team_member_profiles?.team_type, Number(s.total_minutes || 0)/60, s.team_member_profiles?.hourly_rate, (Number(s.total_minutes || 0)/60)*Number(s.team_member_profiles?.hourly_rate || 0)])];
      return json({ success: true, batch, sessionCount: ids.length, summaryCsv: summaryRows.map((row) => row.map(csvEscape).join(",")).join("\n") });
    }

    return json({ error: "Unknown function." }, 404);
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Function failed." }, 500); }
});
