import {
  getBestExternalReservationUrl,
  getReservationProviderName,
} from "@/lib/reservation-links";

export type ReservationAttributionContext = {
  search_id?: string | null;
  session_id?: string | null;
  anonymous_id?: string | null;
  result_impression_id?: string | null;
  promotion_campaign_id?: string | null;
  promotion_event_id?: string | null;
  source_event_id?: string | null;
  channel_class?: "organic" | "sponsored" | "owned" | "unknown" | null;
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
};

export type ReservationLocation = Record<string, unknown> & {
  id?: string | number | null;
  detail_location_type?: string | null;
  location_type?: string | null;
  external_reservation_url?: string | null;
  reservation_url?: string | null;
  booking_url?: string | null;
  reservation_link?: string | null;
  internal_reservations_enabled?: boolean | null;
  uses_internal_reservations?: boolean | null;
  reservation_source?: string | null;
  reservation_provider?: string | null;
  website?: string | null;
  google_maps_url?: string | null;
};

export function getExternalReservationUrl(location: ReservationLocation | null | undefined) {
  return getBestExternalReservationUrl({
    external_reservation_url: location?.external_reservation_url,
    reservation_url: location?.reservation_url,
    booking_url: location?.booking_url,
    reservation_link: location?.reservation_link,
  });
}

export function getInternalReservationHref(
  location: {
    id?: string | number | null;
    detail_location_type?: string | null;
    location_type?: string | null;
  },
  fallbackType: "restaurant" | "activity" = "restaurant",
  attribution?: ReservationAttributionContext | null,
) {
  const rawType =
    location?.detail_location_type || location?.location_type || fallbackType;
  const normalizedType =
    rawType === "activities" || rawType === "activity" ? "activity" : "restaurant";
  if (!location?.id) return null;

  const url = new URL(
    `https://reserve.theouthaven.com/reserve/location/${encodeURIComponent(location.id)}`,
  );
  url.searchParams.set("type", normalizedType);
  const params: Array<[string, string | null | undefined]> = [
    ["toh_search_id", attribution?.search_id],
    ["toh_session_id", attribution?.session_id],
    ["toh_anonymous_id", attribution?.anonymous_id],
    ["toh_result_impression_id", attribution?.result_impression_id],
    ["toh_promotion_campaign_id", attribution?.promotion_campaign_id],
    ["toh_promotion_event_id", attribution?.promotion_event_id],
    ["toh_source_event_id", attribution?.source_event_id],
    ["toh_channel_class", attribution?.channel_class],
    ["utm_source", attribution?.source],
    ["utm_medium", attribution?.medium],
    ["utm_campaign", attribution?.campaign],
  ];
  for (const [key, value] of params) {
    const clean = String(value || "").trim();
    if (clean) url.searchParams.set(key, clean);
  }
  return url.toString();
}

export function getExternalReservationProvider(location: ReservationLocation | null | undefined) {
  return (
    (typeof location?.reservation_provider === "string" && location.reservation_provider.trim()) ||
    getReservationProviderName(getExternalReservationUrl(location)) ||
    null
  );
}

export function getReservationSourceLabel(location: ReservationLocation | null | undefined) {
  const source = String(location?.reservation_source || "external").toLowerCase();
  const externalUrl = getExternalReservationUrl(location);
  const provider = getReservationProviderName(externalUrl);
  const hasInternal = Boolean(
    location?.internal_reservations_enabled || location?.uses_internal_reservations,
  );

  if ((source === "internal" || hasInternal) && source !== "both") {
    return "Reservations powered by TheOutHaven";
  }

  if (provider) {
    return source === "both"
      ? `External reservations via ${provider}`
      : `Book through ${provider}`;
  }

  return null;
}