import { NextRequest, NextResponse } from "next/server";
import { recordExternalBookingDecision } from "@/lib/outings/external-booking";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);
}

const SOURCES = new Set(["site_return", "guest_plan", "guided_plan", "concierge_sms"]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const outingId = typeof body.outingId === "string" ? body.outingId.trim() : "";
    const planToken = typeof body.planToken === "string" ? body.planToken.trim() : "";
    const locationId = typeof body.locationId === "string" ? body.locationId.trim() : "";
    const decision = body.booked === true || body.decision === "confirmed" ? "confirmed" : body.booked === false || body.decision === "failed" ? "failed" : null;
    const source = SOURCES.has(String(body.source || "")) ? String(body.source) : "site_return";

    if ((!isUuid(outingId) && !planToken) || !isUuid(locationId) || !decision) {
      return NextResponse.json({ ok: false, error: "invalid_external_booking_request" }, { status: 400 });
    }

    let query = supabaseAdmin
      .from("outings")
      .select("id,user_id,guest_session_id,plan_access_token,plan_access_token_expires_at");
    query = planToken ? query.eq("plan_access_token", planToken) : query.eq("id", outingId);
    const { data: outing, error } = await query.maybeSingle();
    if (error || !outing) return NextResponse.json({ ok: false, error: "outing_not_found" }, { status: 404 });

    let authorized = false;
    if (planToken) {
      authorized = outing.plan_access_token === planToken && (!outing.plan_access_token_expires_at || new Date(outing.plan_access_token_expires_at).getTime() > Date.now());
    } else {
      const supabase = await createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (auth?.user?.id && outing.user_id === auth.user.id) authorized = true;
      const guestSession = req.cookies.get("theouthaven_guest_session")?.value || null;
      if (!authorized && guestSession && outing.guest_session_id === guestSession) authorized = true;
    }
    if (!authorized) return NextResponse.json({ ok: false, error: "external_booking_not_authorized" }, { status: 403 });

    const result = await recordExternalBookingDecision({
      outingId: outing.id,
      locationId,
      decision,
      source,
    });
    if (!result.ok) return NextResponse.json(result, { status: 404 });

    return NextResponse.json({
      ok: true,
      bookingStatus: result.booking.status,
      externalBookingsComplete: result.summary.complete,
      requiredExternalBookings: result.summary.required,
      confirmedExternalBookings: result.summary.confirmed,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "external_booking_update_failed" }, { status: 500 });
  }
}
