import { NextRequest, NextResponse } from "next/server";
import { isUuid, trackEvent } from "@/lib/analytics/trackEvent";
import { trackLocationAnalyticsEvent, type BusinessAnalyticsEventType } from "@/lib/analytics/business-analytics";
import { supabaseAdmin } from "@/lib/supabase-admin";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "tel:"]);
const LINK_TYPES = new Set(["details", "directions", "reservation", "phone", "website", "share", "replace", "add_stop", "other"]);

function clean(value: string | null, max = 500) {
  return value?.trim().slice(0, max) || null;
}

function safeDestination(raw: string | null) {
  const value = clean(raw, 2_000);
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function eventNameForType(type: string) {
  switch (type) {
    case "details": return "outing_details_clicked";
    case "directions": return "outing_directions_clicked";
    case "reservation": return "outing_reservation_clicked";
    case "phone": return "outing_phone_clicked";
    case "website": return "outing_website_clicked";
    case "share": return "outing_share_clicked";
    case "replace": return "outing_replace_location_clicked";
    case "add_stop": return "outing_add_stop_clicked";
    default: return "outing_link_clicked";
  }
}

function eventTypeForType(type: string) {
  switch (type) {
    case "directions": return "directions_click";
    case "reservation": return "reservation_started";
    case "phone": return "phone_click";
    case "website": return "website_click";
    case "share": return "share_click";
    default: return "click";
  }
}

function businessEventForType(type: string): BusinessAnalyticsEventType {
  switch (type) {
    case "directions": return "directions_click";
    case "reservation": return "reservation_started";
    case "phone": return "phone_click";
    case "website": return "website_click";
    case "share": return "share_click";
    default: return "search_click";
  }
}

function statusForType(type: string) {
  if (type === "reservation") return "reservation_clicked";
  if (type === "phone") return "call_clicked";
  if (["website", "directions", "details", "share"].includes(type)) return "link_clicked";
  return null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const destination = safeDestination(searchParams.get("to"));
  if (!destination) {
    return NextResponse.redirect(new URL("/plan", req.nextUrl), { status: 302 });
  }

  const rawType = clean(searchParams.get("type"), 40) || "other";
  const linkType = LINK_TYPES.has(rawType) ? rawType : "other";
  const outingId = clean(searchParams.get("outingId"), 80);
  const locationId = clean(searchParams.get("locationId"), 80);
  const sourceLocationId = clean(searchParams.get("sourceLocationId"), 120);
  const locationType = clean(searchParams.get("locationType"), 40) || "unknown";
  const planTitle = clean(searchParams.get("planTitle"), 300);
  const source = clean(searchParams.get("source"), 80) || "plan_page";
  const sessionId = clean(searchParams.get("session_id"), 200);
  const anonymousId = clean(searchParams.get("anonymous_id"), 200);
  const nextStatus = statusForType(linkType);

  await Promise.allSettled([
    isUuid(outingId)
      ? (async () => {
          const { data: existing } = await supabaseAdmin.from("outings").select("status,link_click_count").eq("id", outingId).maybeSingle();
          const patch: Record<string, unknown> = {
            last_link_clicked_at: new Date().toISOString(),
            last_link_clicked_type: linkType,
            link_click_count: Number(existing?.link_click_count || 0) + 1,
          };
          if (nextStatus && (nextStatus !== "link_clicked" || ["planned", "saved"].includes(String(existing?.status || "")))) {
            patch.status = nextStatus;
          }
          await supabaseAdmin.from("outings").update(patch).eq("id", outingId);
        })()
      : Promise.resolve(),
    trackEvent({
      event_name: eventNameForType(linkType),
      event_type: eventTypeForType(linkType),
      conversion_step: "clicked_outbound_link",
      outing_id: outingId,
      location_id: locationId,
      source_location_id: sourceLocationId ?? locationId,
      session_id: sessionId,
      anonymous_id: anonymousId,
      page_path: "/plan",
      source,
      location_type: locationType,
      metadata: {
        destination_host: destination.protocol === "tel:" ? "phone" : destination.host,
        destination_protocol: destination.protocol,
        destination_url_redacted_or_limited: destination.toString().slice(0, 500),
        link_type: linkType,
        location_type: locationType,
        plan_title: planTitle,
      },
    }),
    isUuid(locationId)
      ? trackLocationAnalyticsEvent({
          locationId,
          eventType: businessEventForType(linkType),
          eventSource: source,
          sessionId,
          searchQuery: planTitle,
          outingType: locationType,
          referrer: "/plan",
          metadata: { link_type: linkType, plan_title: planTitle },
        })
      : Promise.resolve(),
  ]);

  return NextResponse.redirect(destination, { status: 302 });
}
