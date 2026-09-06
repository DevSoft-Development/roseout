import { mobileApi } from "@/lib/api";
import { captureMobileError } from "@/lib/observability";

export async function trackMobileEvent(
  eventName: string,
  input: {
    screen?: string;
    outingId?: string;
    locationId?: string;
    metadata?: Record<string, unknown>;
    dedupeKey?: string;
  } = {},
) {
  try {
    await mobileApi("/analytics", {
      method: "POST",
      body: JSON.stringify({ eventName, ...input }),
    });
  } catch (error) {
    captureMobileError(error, { operation: "track_mobile_event", eventName });
  }
}
