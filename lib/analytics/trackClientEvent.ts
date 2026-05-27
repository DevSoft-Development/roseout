type ClientTrackEventInput = {
  event_name: string;
  location_id?: string | null;
  source_location_id?: string | null;
  query?: string | null;
  ranking_position?: number | null;
  source?: string | null;
  city?: string | null;
  borough?: string | null;
  neighborhood?: string | null;
  location_type?: string | null;
  category?: string | null;
  metadata?: Record<string, unknown>;
};

function getDeviceHints() {
  if (typeof navigator === "undefined") return {};
  const ua = navigator.userAgent || "";
  return {
    browser: ua.includes("Chrome") ? "chrome" : ua.includes("Safari") ? "safari" : "other",
    os: ua.includes("Windows") ? "windows" : ua.includes("Mac") ? "macos" : ua.includes("Linux") ? "linux" : "other",
    device_type: /Mobi|Android/i.test(ua) ? "mobile" : "desktop",
  };
}

export function trackClientEvent(input: ClientTrackEventInput) {
  try {
    const payload = {
      ...input,
      page_path: typeof window !== "undefined" ? window.location.pathname : null,
      referrer: typeof document !== "undefined" ? document.referrer || null : null,
      ...getDeviceHints(),
    };

    void fetch("/api/analytics/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify(payload),
    });
  } catch {
    // no-op
  }
}
