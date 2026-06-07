import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateReviewToken } from "@/lib/tokens/secure-token";
import { trackEvent } from "@/lib/analytics/trackEvent";

function addDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

async function load(token: string) {
  return supabaseAdmin.from("outings").select("*").eq("confirm_token", token).maybeSingle();
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data } = await load(token);
  if (!data) return NextResponse.json({ ok: false, error: "confirm_token_not_found" }, { status: 404 });
  if (data.confirm_token_expires_at && new Date(data.confirm_token_expires_at).getTime() < Date.now()) return NextResponse.json({ ok: false, error: "confirm_token_expired" }, { status: 410 });
  return NextResponse.json({ ok: true, outing: { id: data.id, status: data.status, outing_date_context: data.outing_date_context, planned_for: data.planned_for, attendance_confirmed_at: data.attendance_confirmed_at, attendance_declined_at: data.attendance_declined_at } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body.action === "did_not_go" ? "did_not_go" : "went";
  const { data: outing } = await load(token);
  if (!outing) return NextResponse.json({ ok: false, error: "confirm_token_not_found" }, { status: 404 });
  if (outing.confirm_token_expires_at && new Date(outing.confirm_token_expires_at).getTime() < Date.now()) return NextResponse.json({ ok: false, error: "confirm_token_expired" }, { status: 410 });
  if (outing.status === "cancelled") return NextResponse.json({ ok: false, error: "outing_cancelled" }, { status: 400 });
  if (outing.attendance_confirmed_at || outing.attendance_declined_at) return NextResponse.json({ ok: false, error: "attendance_already_recorded" }, { status: 409 });

  const source = outing.user_id ? "user_token" : "guest_token";
  if (action === "did_not_go") {
    const { error } = await supabaseAdmin.from("outings").update({ attendance_declined_at: new Date().toISOString(), attendance_declined_source: source, status: "cancelled" }).eq("id", outing.id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    await trackEvent({ event_name: outing.user_id ? "outing_attendance_declined" : "guest_attendance_declined", outing_id: outing.id, user_id: outing.user_id, location_id: outing.location_id, metadata: { guest_session_id: outing.guest_session_id } });
    return NextResponse.json({ ok: true, action, reviewUrl: null });
  }

  const locationId = outing.location_id || (/^[0-9a-f-]{36}$/i.test(String(outing.source_location_id || "")) ? outing.source_location_id : null);
  if (!locationId) return NextResponse.json({ ok: false, error: "missing_location_id" }, { status: 400 });
  const { error: updateError } = await supabaseAdmin.from("outings").update({ attendance_confirmed_at: new Date().toISOString(), attendance_confirmed_source: source, likely_visit_at: new Date().toISOString(), status: "completed", visit_verification_level: "likely_visited", visit_verification_source: outing.user_id ? "user_self_confirmed" : "guest_self_confirmed" }).eq("id", outing.id);
  if (updateError) return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });

  let { data: eligibility } = await supabaseAdmin.from("location_review_eligibility").select("*").eq("outing_id", outing.id).maybeSingle();
  if (!eligibility) {
    const reviewToken = generateReviewToken();
    const { data: created, error } = await supabaseAdmin.from("location_review_eligibility").insert({ location_id: locationId, user_id: outing.user_id, outing_id: outing.id, guest_session_id: outing.guest_session_id, guest_email: outing.guest_email, source: "guest_followup", status: "eligible", review_token: reviewToken, review_token_expires_at: addDays(30), metadata: { created_from: "outing_confirm" } }).select("*").single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    eligibility = created;
  }
  await Promise.allSettled([
    trackEvent({ event_name: outing.user_id ? "outing_attendance_confirmed" : "guest_attendance_confirmed", outing_id: outing.id, user_id: outing.user_id, location_id: locationId, metadata: { guest_session_id: outing.guest_session_id } }),
    trackEvent({ event_name: "review_eligibility_created", outing_id: outing.id, user_id: outing.user_id, location_id: locationId, metadata: { guest_session_id: outing.guest_session_id } }),
  ]);
  return NextResponse.json({ ok: true, action, reviewToken: eligibility.review_token, reviewUrl: `/reviews/verified/${eligibility.review_token}` });
}
