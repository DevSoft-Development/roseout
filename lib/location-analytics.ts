export type LocationEventType =
  | "view"
  | "click"
  | "save"
  | "booking"
  | "skip";

const LOCATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type LocationAnalyticsMetadata = {
  source_page?: string;
  source_section?: string;
  campaign_id?: string;
  search_id?: string;
  session_id?: string;
  search_query?: string;
  result_position?: number;
  result_type?: "restaurant" | "activity" | "pair" | "matched_location";
  event_id?: string;
  traffic_type?: "production" | "internal_test";
  is_test_event?: boolean;
  test_run_id?: string;
  metadata?: Record<string, unknown>;
};

function createEventId(locationId: string, eventType: LocationEventType) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${locationId}:${eventType}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

export async function trackLocationEvent(
  locationId: string | null | undefined,
  eventType: LocationEventType,
  metadata?: LocationAnalyticsMetadata,
) {
  if (!locationId || !eventType || !LOCATION_ID_PATTERN.test(locationId)) return;

  const eventId = metadata?.event_id || createEventId(locationId, eventType);

  try {
    await fetch("/api/analytics/location-event", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      keepalive: true,
      body: JSON.stringify({
        location_id: locationId,
        event_type: eventType,
        ...metadata,
        event_id: eventId,
      }),
    });
  } catch (error) {
    console.warn("Failed to track location event", error);
  }
}