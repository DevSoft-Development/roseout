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
};

export async function trackLocationEvent(
  locationId: string | null | undefined,
  eventType: LocationEventType,
  metadata?: LocationAnalyticsMetadata,
) {
  if (!locationId || !eventType || !LOCATION_ID_PATTERN.test(locationId)) return;

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
      }),
    });
  } catch (error) {
    console.warn("Failed to track location event", error);
  }
}
