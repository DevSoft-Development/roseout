import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import {
  BUSINESS_ANALYTICS_EVENT_TYPES,
  trackLocationAnalyticsEvent,
  type BusinessAnalyticsEventType,
} from "@/lib/analytics/business-analytics";

const MAX_METADATA_BYTES = 8_000;
const MAX_TEXT_LENGTH = 500;

function cleanString(value: unknown, max = MAX_TEXT_LENGTH) {
  return typeof value === "string" ? value.trim().slice(0, max) : undefined;
}

function cleanMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const json = JSON.stringify(value);
  if (json.length > MAX_METADATA_BYTES) {
    return { truncated: true };
  }

  return value as Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const locationId = cleanString(body.location_id, 80);
    const eventType = cleanString(body.event_type, 80) as BusinessAnalyticsEventType | undefined;

    if (!locationId) {
      return NextResponse.json({ success: false, error: "Missing location_id." }, { status: 400 });
    }

    if (!eventType || !BUSINESS_ANALYTICS_EVENT_TYPES.includes(eventType)) {
      return NextResponse.json({ success: false, error: "Invalid event_type." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    await trackLocationAnalyticsEvent({
      locationId,
      userId: user?.id || null,
      eventType,
      eventSource: cleanString(body.event_source, 80) || "web",
      sessionId: cleanString(body.session_id, 180),
      searchQuery: cleanString(body.search_query, 500),
      outingType: cleanString(body.outing_type, 160),
      referrer: cleanString(body.referrer, 500) || request.headers.get("referer"),
      metadata: cleanMetadata(body.metadata),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Location analytics event API failed", error);
    return NextResponse.json({ success: true });
  }
}
