export const ACTIVE_OUTING_KEY = "theouthaven_active_outing";

type TrackOutingPayload = {
  source_location_id?: string | null;
  location_id?: string | null;
  location_type?: string | null;
  contact_method: "external_reservation" | "phone";
  reservation_type?: string | null;
  external_reservation_url?: string | null;
  phone_number?: string | null;
  source?: string | null;
  page_path?: string | null;
};

export async function trackOutingBeforeAction(payload: TrackOutingPayload) {
  try {
    const response = await fetch("/api/outings/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) {
      console.warn("THEOUTHAVEN_OUTING_TRACKING_CLIENT_FAILED", { status: response.status, result });
      return null;
    }

    return typeof result.outing_id === "string" ? result.outing_id : null;
  } catch (error) {
    console.warn("THEOUTHAVEN_OUTING_TRACKING_CLIENT_ERROR", error);
    return null;
  }
}
