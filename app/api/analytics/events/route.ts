import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { trackEvent } from "@/lib/analytics/trackEvent";

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const eventName = cleanString(body?.event_name) ?? "unknown_event";
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();

    await trackEvent({
      event_name: eventName,
      event_type: cleanString(body?.event_type),
      user_id: auth?.user?.id ?? null,
      anonymous_id: cleanString(body?.anonymous_id),
      session_id: cleanString(body?.session_id),
      location_id: cleanString(body?.location_id),
      source_location_id: cleanString(body?.source_location_id),
      query: cleanString(body?.query),
      page_path: cleanString(body?.page_path),
      referrer: cleanString(body?.referrer),
      source: cleanString(body?.source),
      device_type: cleanString(body?.device_type),
      browser: cleanString(body?.browser),
      os: cleanString(body?.os),
      borough: cleanString(body?.borough),
      city: cleanString(body?.city),
      neighborhood: cleanString(body?.neighborhood),
      location_type: cleanString(body?.location_type),
      category: cleanString(body?.category),
      ranking_position: typeof body?.ranking_position === "number" ? body.ranking_position : null,
      metadata: body?.metadata && typeof body.metadata === "object" ? body.metadata : {},
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
