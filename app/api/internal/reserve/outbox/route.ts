import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 55;

function authorized(request: NextRequest) {
  const expected = String(process.env.WORKER_INTERNAL_SECRET || "").trim();
  if (!expected) return false;
  const auth = String(request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const cron = String(request.headers.get("x-cron-secret") || "").trim();
  const provided = auth || cron;
  if (!provided || provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

async function processEvent(event: any) {
  const reservation = event.reservation_id
    ? await supabaseAdmin
        .from("location_reservations")
        .select("id,location_id,reservation_date,party_size,status")
        .eq("id", event.reservation_id)
        .eq("location_id", event.location_id)
        .maybeSingle()
    : { data: null, error: null } as any;
  const serviceDate = reservation.data?.reservation_date || new Date(event.created_at || Date.now()).toISOString().slice(0, 10);

  if (event.event_type === "reservation.seated") {
    await supabaseAdmin.rpc("reserve_increment_daily_metric", { p_location_id: event.location_id, p_service_date: serviceDate, p_metric: "seated_parties", p_amount: 1 });
    await supabaseAdmin.rpc("reserve_increment_daily_metric", { p_location_id: event.location_id, p_service_date: serviceDate, p_metric: "seated_covers", p_amount: Math.max(1, Number(reservation.data?.party_size || 1)) });
  } else if (event.event_type === "waitlist.seated") {
    await supabaseAdmin.rpc("reserve_increment_daily_metric", { p_location_id: event.location_id, p_service_date: serviceDate, p_metric: "waitlist_parties_seated", p_amount: 1 });
  } else if (event.event_type === "server.auto_assigned") {
    await supabaseAdmin.rpc("reserve_increment_daily_metric", { p_location_id: event.location_id, p_service_date: serviceDate, p_metric: "automatic_server_assignments", p_amount: 1 });
  } else if (event.event_type === "manager.override") {
    await supabaseAdmin.rpc("reserve_increment_daily_metric", { p_location_id: event.location_id, p_service_date: serviceDate, p_metric: "manager_overrides", p_amount: 1 });
  }
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(Number(body.limit || 25) || 25, 100));
  const claim = await supabaseAdmin.rpc("reserve_claim_background_outbox", { p_limit: limit });
  if (claim.error) return NextResponse.json({ success: false, error: claim.error.message }, { status: 500 });
  const events = claim.data || [];
  let succeeded = 0;
  let failed = 0;
  for (const event of events) {
    try {
      await processEvent(event);
      const complete = await supabaseAdmin.rpc("reserve_complete_background_outbox", { p_id: event.id });
      if (complete.error) throw complete.error;
      succeeded += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "Reserve background event failed";
      await supabaseAdmin.rpc("reserve_fail_background_outbox", {
        p_id: event.id,
        p_error: message,
        p_delay_seconds: Math.min(3600, 30 * 2 ** Math.min(Number(event.attempts || 1), 6)),
      });
    }
  }
  return NextResponse.json({ success: true, worker: "reserve-outbox", claimed: events.length, succeeded, failed });
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { count, error } = await supabaseAdmin
    .from("reserve_background_outbox")
    .select("id", { count: "exact", head: true })
    .in("status", ["pending", "failed"]);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, worker: "reserve-outbox", pending: count || 0 });
}