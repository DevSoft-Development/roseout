import {
  detectReservationProvider,
  isReservationProviderUrl,
  normalizeReservationUrl,
  type ReservationProvider,
} from "./reservation-providers";

export {
  detectReservationProvider,
  isReservationProviderUrl,
  normalizeReservationUrl,
  type ReservationProvider,
} from "./reservation-providers";

export const GOOGLE_PLACE_DETAILS_FIELD_MASK = [
  "id",
  "name",
  "displayName",
  "formattedAddress",
  "websiteUri",
  "googleMapsUri",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "rating",
  "userRatingCount",
  "priceLevel",
  "businessStatus",
].join(",");

export const GOOGLE_TEXT_SEARCH_FIELD_MASK = [
  "places.id",
  "places.name",
  "places.displayName",
  "places.formattedAddress",
  "places.websiteUri",
  "places.googleMapsUri",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.businessStatus",
].join(",");

export type GooglePlaceDetails = Record<string, unknown> & {
  id?: string;
  name?: string;
  displayName?: { text?: string; languageCode?: string };
  formattedAddress?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  businessStatus?: string;
};

export function getReservationProvider(url: unknown): ReservationProvider | null {
  return detectReservationProvider(url);
}

export function getReservationProviderName(url: unknown) {
  return detectReservationProvider(url)?.name || null;
}

export function isReservationProvider(url: unknown) {
  return isReservationProviderUrl(url);
}

export function extractReservationUrl(
  place: Record<string, unknown> | null | undefined,
) {
  if (!place) return null;

  const candidates = [
    place.reservation_url,
    place.reservationLink,
    place.reservation_link,
    place.booking_url,
    place.bookingUrl,
    place.websiteUri,
    place.website,
    place.googleMapsUri,
    place.googleMapsUrl,
    place.url,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeReservationUrl(candidate);
    if (normalized) return normalized;
  }

  return null;
}

export function getBestExternalReservationUrl(
  location: Record<string, unknown> | null | undefined,
) {
  if (!location) return null;
  return extractReservationUrl({
    reservation_url: location.reservation_url,
    reservation_link: location.reservation_link,
    booking_url: location.booking_url,
    external_reservation_url: location.external_reservation_url,
  });
}

export function getGooglePlaceIdFromRow(
  row: Record<string, unknown> | null | undefined,
) {
  if (!row) return null;

  for (const column of ["google_place_id", "place_id", "google_id"]) {
    const value = row[column];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return null;
}

