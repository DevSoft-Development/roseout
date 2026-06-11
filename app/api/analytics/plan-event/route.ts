import { NextRequest, NextResponse } from "next/server";
import { isUuid, trackEvent } from "@/lib/analytics/trackEvent";
import { supabaseAdmin } from "@/lib/supabase-admin";

function clean(value: unknown, max = 500) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const eventName = clean(payload?.event_name, 120) || "plan_confirmation_viewed";
    const outingId = clean(payload?.outing_id ?? payload?.outingId, 80);
    const locationId = clean(payload?.location_id ?? payload?.locationId, 80);
    const sourceLocationId = clean(payload?.source_location_id ?? payload?.sourceLocationId, 120);

    if (eventName === "plan_confirmation_viewed" && isUuid(outingId)) {
      await supabaseAdmin.from("outings").update({ confirmation_viewed_at: new Date().toISOString() }).eq("id", outingId);
    }

    await trackEvent({
      event_name: eventName,
      event_type: clean(payload?.event_type, 80) || "conversion",
      conversion_step: clean(payload?.conversion_step, 120) || "saved_plan",
      outing_id: outingId,
      location_id: locationId,
      source_location_id: sourceLocationId ?? locationId,
      page_path: clean(payload?.page_path, 300) || "/plan",
      source: clean(payload?.source, 120) || "plan_page",
      session_id: clean(payload?.session_id, 200),
      anonymous_id: clean(payload?.anonymous_id, 200),
      query: clean(payload?.query, 500),
      metadata: typeof payload?.metadata === "object" && payload.metadata ? payload.metadata : {},
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
