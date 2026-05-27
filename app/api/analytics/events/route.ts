import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { trackAnalyticsEvent, type TrackAnalyticsEventInput } from "@/lib/analytics/trackEvent";

const ALLOWED_EVENTS = new Set([
  "search_submitted","search_intent_parsed","search_results_returned","search_results_viewed","search_no_results","search_fallback_used","search_card_impression",
  "location_card_viewed","location_card_clicked","location_details_viewed","save_clicked","share_clicked","claim_business_clicked",
  "reserve_clicked","call_clicked","external_reservation_opened","phone_call_started",
  "outing_started","outing_completed","outing_cancelled","outing_rating_submitted","outing_vibe_feedback_submitted",
  "business_profile_viewed","owner_dashboard_viewed","owner_metric_viewed","promoted_location_viewed","promoted_location_clicked","featured_location_impression","featured_location_clicked",
  "signup_started","signup_completed","login_completed","location_owner_signup_started","location_owner_signup_completed","claim_request_started","claim_request_submitted","claim_request_approved",
]);

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Partial<TrackAnalyticsEventInput>;
  if (!body?.event_name || !ALLOWED_EVENTS.has(body.event_name)) return NextResponse.json({ ok: false, error: "invalid_event" }, { status: 400 });
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : {};
  const safePayload: TrackAnalyticsEventInput = {
    ...body,
    user_id: user?.id ?? body.user_id ?? null,
    anonymous_id: body.anonymous_id ?? null,
    session_id: body.session_id ?? null,
    metadata,
    event_name: body.event_name,
  };
  await trackAnalyticsEvent(safePayload);
  return NextResponse.json({ ok: true });
}
