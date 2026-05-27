import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { trackAnalyticsEvent } from "@/lib/analytics/trackEvent";

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const outingId = cleanString(payload?.outing_id);
    if (!outingId) {
      return NextResponse.json({ ok: false, error: "missing_outing_id", message: "An outing id is required." }, { status: 400 });
    }

    console.info("THEOUTHAVEN_OUTING_COMPLETE_STARTED", { outing_id: outingId });
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("outings")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        rating: typeof payload?.rating === "number" ? payload.rating : null,
        matched_vibe: typeof payload?.matched_vibe === "boolean" ? payload.matched_vibe : null,
        would_go_again: typeof payload?.would_go_again === "boolean" ? payload.would_go_again : null,
        feedback: cleanString(payload?.feedback),
      })
      .eq("id", outingId)
      .select("id, source_location_id, location_id, user_id")
      .single();

    if (error) {
      console.error("THEOUTHAVEN_OUTING_COMPLETE_FAILED", { error: error.message, outing_id: outingId });
      return NextResponse.json({ ok: false, error: "outing_complete_failed", message: "We could not mark this outing as completed." }, { status: 500 });
    }
    if (!data?.id) {
      console.error("THEOUTHAVEN_OUTING_COMPLETE_FAILED_NO_DATA", { outing_id: outingId });
      return NextResponse.json({ ok: false, error: "outing_complete_missing_data", message: "No outing record was updated." }, { status: 404 });
    }

    const completedOutingId = data.id;
    const completedLocationId = data.source_location_id ?? data.location_id ?? null;

    await trackAnalyticsEvent({ event_name: "outing_completed", user_id: data.user_id ?? null, location_id: completedLocationId, outing_id: completedOutingId, page_path: cleanString(payload?.page_path), source: "outing_complete", metadata: { rating: payload?.rating ?? null, matched_vibe: payload?.matched_vibe ?? null, would_go_again: payload?.would_go_again ?? null } });

    if (typeof payload?.rating === "number" || typeof payload?.matched_vibe === "boolean" || typeof payload?.would_go_again === "boolean") {
      await trackAnalyticsEvent({ event_name: "outing_completion_rating_submitted", user_id: data.user_id ?? null, location_id: completedLocationId, outing_id: completedOutingId, page_path: cleanString(payload?.page_path), source: "outing_complete", metadata: { rating: payload?.rating ?? null, matched_vibe: payload?.matched_vibe ?? null, would_go_again: payload?.would_go_again ?? null } });
    }

    console.info("THEOUTHAVEN_OUTING_COMPLETE_SUCCESS", { outing_id: completedOutingId });
    return NextResponse.json({ ok: true, outing_id: completedOutingId });
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_request", message: "Invalid request payload." }, { status: 400 });
  }
}
