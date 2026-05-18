export type ReservationProvider = {
  host: string;
  name: string;
  pathIncludes?: string[];
};


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

export const RESERVATION_PROVIDERS: ReservationProvider[] = [
  { host: "resy.com", name: "Resy" },
  { host: "opentable.com", name: "OpenTable" },
  { host: "exploretock.com", name: "Tock" },
  { host: "sevenrooms.com", name: "SevenRooms" },
  {
    host: "yelp.com",
    name: "Yelp Reservations",
    pathIncludes: ["/reservations"],
  },
  { host: "book.squareup.com", name: "Square" },
  { host: "calendly.com", name: "Calendly" },
  { host: "mindbodyonline.com", name: "Mindbody" },
  { host: "fareharbor.com", name: "FareHarbor" },
  { host: "peek.com", name: "Peek" },
  { host: "eventbrite.com", name: "Eventbrite" },
];

function getUrl(value: unknown): URL | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed);
  } catch {
    try {
      return new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }
}

function matchesHost(hostname: string, providerHost: string) {
  return hostname === providerHost || hostname.endsWith(`.${providerHost}`);
}

export function getReservationProvider(
  url: unknown,
): ReservationProvider | null {
  const parsed = getUrl(url);
  if (!parsed) return null;

  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const pathname = parsed.pathname.toLowerCase();

  return (
    RESERVATION_PROVIDERS.find((provider) => {
      if (!matchesHost(hostname, provider.host)) return false;
      if (!provider.pathIncludes?.length) return true;
      return provider.pathIncludes.some((path) => pathname.includes(path));
    }) || null
  );
}

export function getReservationProviderName(url: unknown) {
  return getReservationProvider(url)?.name || null;
}

export function isReservationProvider(url: unknown) {
  return Boolean(getReservationProvider(url));
}

export function normalizeReservationUrl(url: unknown) {
  const parsed = getUrl(url);
  if (!parsed || !isReservationProvider(parsed.toString())) return null;

  parsed.hash = "";
  parsed.protocol = "https:";
  return parsed.toString();
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

