"use client";

import type { TrackAnalyticsEventInput } from "@/lib/analytics/trackEvent";

export async function trackClientEvent(input: TrackAnalyticsEventInput): Promise<void> {
  try {
    void fetch("/api/analytics/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...input,
        page_path: input.page_path ?? (typeof window !== "undefined" ? window.location.pathname : null),
        referrer: input.referrer ?? (typeof document !== "undefined" ? document.referrer : null),
      }),
      keepalive: true,
    });
  } catch {
    // swallow by design
  }
}
