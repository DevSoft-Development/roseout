import {
  getBestExternalReservationUrl,
  getReservationProviderName,
} from "@/lib/reservation-links";

export type ReservationLocation = Record<string, unknown> & {
  id?: string | null;
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
    id?: string | null;
    detail_location_type?: string | null;
    location_type?: string | null;
  },
  fallbackType: "restaurant" | "activity" = "restaurant"
) {
  const rawType =
    location?.detail_location_type || location?.location_type || fallbackType;
  const normalizedType =
    rawType === "activities" || rawType === "activity" ? "activity" : "restaurant";

  return location?.id
    ? `/reserve/location/${encodeURIComponent(location.id)}?type=${normalizedType}`
    : null;
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
