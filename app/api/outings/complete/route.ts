import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { trackEvent } from "@/lib/analytics/trackEvent";

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

    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) {
      return NextResponse.json({ ok: false, error: "unauthorized", message: "You must be signed in to complete an outing." }, { status: 401 });
    }

    const rating = typeof payload?.rating === "number" && payload.rating >= 1 && payload.rating <= 5 ? payload.rating : null;
    const feedback = cleanString(payload?.feedback);

    const { data, error } = await supabase
      .from("outings")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        rating,
        matched_vibe: typeof payload?.matched_vibe === "boolean" ? payload.matched_vibe : null,
        would_go_again: typeof payload?.would_go_again === "boolean" ? payload.would_go_again : null,
        feedback,
      })
      .eq("id", outingId)
      .eq("user_id", userId)
      .select("id, source_location_id, location_id, user_id")
      .single();

    if (error || !data?.id) {
      return NextResponse.json({ ok: false, error: "outing_not_found_or_forbidden", message: "Outing not found or access denied." }, { status: 403 });
    }

    await trackEvent({ event_name: "outing_completed", user_id: data.user_id ?? null, location_id: data.location_id ?? null, source_location_id: data.source_location_id ?? null, outing_id: data.id, page_path: cleanString(payload?.page_path), source: "outing_complete", metadata: { rating, matched_vibe: payload?.matched_vibe ?? null, would_go_again: payload?.would_go_again ?? null } });

    return NextResponse.json({ ok: true, outing_id: data.id });
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_request", message: "Invalid request payload." }, { status: 400 });
  }
}
