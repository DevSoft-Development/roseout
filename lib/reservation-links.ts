export type ReservationProvider = {
  host: string;
  name: string;
  pathIncludes?: string[];
};

export const RESERVATION_PROVIDERS: ReservationProvider[] = [
  { host: "resy.com", name: "Resy" },
  { host: "opentable.com", name: "OpenTable" },
  { host: "exploretock.com", name: "Tock" },
  { host: "sevenrooms.com", name: "SevenRooms" },
  { host: "yelp.com", name: "Yelp Reservations", pathIncludes: ["/reservations"] },
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

export function getReservationProvider(url: unknown): ReservationProvider | null {
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

export function extractReservationUrl(place: Record<string, unknown> | null | undefined) {
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
    place.url,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeReservationUrl(candidate);
    if (normalized) return normalized;
  }

  return null;
}

export function getBestExternalReservationUrl(location: Record<string, unknown> | null | undefined) {
  if (!location) return null;
  return extractReservationUrl({
    reservation_url: location.reservation_url,
    reservation_link: location.reservation_link,
    booking_url: location.booking_url,
    external_reservation_url: location.external_reservation_url,
  });
}
