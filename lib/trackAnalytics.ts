import { trackClientEvent } from "@/lib/analytics/trackClientEvent";

export async function trackAnalytics({
  itemId,
  itemType,
  eventType,
}: {
  itemId: string;
  itemType: "restaurant" | "activity";
  eventType: "view" | "click";
}) {
  try {
    trackClientEvent({
      event_name:
        eventType === "view" ? "location_impression" : "location_clicked",
      location_id: itemId,
      source_location_id: itemId,
      location_type: itemType,
      source: "public_create",
      metadata: {
        legacy_event_type: eventType,
        legacy_item_type: itemType,
      },
    });
  } catch {
    // Analytics should never break the user experience.
  }
}
