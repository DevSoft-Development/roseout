export type ReservationProvider = {
  host: string;
  name: string;
  pathIncludes?: string[];
};

export type ReservationUrlMatch = {
  url: string;
  provider: string;
  confidence: number;
};

export const RESERVATION_PROVIDERS: ReservationProvider[] = [
  { host: "resy.com", name: "Resy" },
  { host: "opentable.com", name: "OpenTable" },
  { host: "exploretock.com", name: "Tock" },
  { host: "sevenrooms.com", name: "SevenRooms" },
  { host: "yelp.com", name: "Yelp Reservations", pathIncludes: ["/reservations"] },
  { host: "book.squareup.com", name: "Square" },
  { host: "toasttab.com", name: "Toast" },
  { host: "eventbrite.com", name: "Eventbrite" },
  { host: "mindbodyonline.com", name: "Mindbody" },
  { host: "fareharbor.com", name: "FareHarbor" },
  { host: "peek.com", name: "Peek" },
  { host: "calendly.com", name: "Calendly" },
  { host: "tablecheck.com", name: "TableCheck" },
  { host: "tablescheck.com", name: "TableCheck" },
  { host: "eatapp.co", name: "Eat App" },
  { host: "simpleerb.com", name: "SimpleERB" },
];

const URL_REGEX = /(?:https?:\/\/|www\.)[^\s"'<>\\)\]]+/gi;

function parseUrl(value: unknown): URL | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/[.,;:!?]+$/, "");
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

function cleanHostname(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function matchesHost(hostname: string, providerHost: string) {
  return hostname === providerHost || hostname.endsWith(`.${providerHost}`);
}

export function detectReservationProvider(url: unknown): ReservationProvider | null {
  const parsed = parseUrl(url);
  if (!parsed) return null;

  const hostname = cleanHostname(parsed.hostname);
  const pathname = parsed.pathname.toLowerCase();

  return (
    RESERVATION_PROVIDERS.find((provider) => {
      if (!matchesHost(hostname, provider.host)) return false;
      if (!provider.pathIncludes?.length) return true;
      return provider.pathIncludes.some((path) => pathname.includes(path));
    }) || null
  );
}

export function isReservationProviderUrl(url: unknown) {
  return Boolean(detectReservationProvider(url));
}

export function normalizeReservationUrl(url: unknown) {
  const parsed = parseUrl(url);
  if (!parsed || !detectReservationProvider(parsed.toString())) return null;

  parsed.hash = "";
  parsed.protocol = "https:";
  if (parsed.hostname.startsWith("www.")) {
    parsed.hostname = parsed.hostname.replace(/^www\./, "");
  }
  return parsed.toString();
}

export function extractReservationUrlsFromText(text: string) {
  if (!text) return [];

  const urls = new Set<string>();
  const decoded = text
    .replace(/\\u0026/g, "&")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"');

  for (const match of decoded.matchAll(URL_REGEX)) {
    const normalized = normalizeReservationUrl(match[0]);
    if (normalized) urls.add(normalized);
  }

  return Array.from(urls).map((url) => {
    const provider = detectReservationProvider(url);
    return {
      url,
      provider: provider?.name || "Reservation provider",
      confidence: provider ? 0.9 : 0,
    } satisfies ReservationUrlMatch;
  });
}

function scoreUrl(url: string) {
  const lower = url.toLowerCase();
  let score = 0.75;
  if (lower.includes("/reserve") || lower.includes("/reservation")) score += 0.12;
  if (lower.includes("/book") || lower.includes("/booking")) score += 0.08;
  if (lower.includes("restaurant") || lower.includes("venue")) score += 0.03;
  if (lower.includes("/event")) score += 0.02;
  return Math.min(score, 0.98);
}

export function chooseBestReservationUrl(urls: Array<string | ReservationUrlMatch>) {
  const matches = urls
    .map((item) => {
      const url = typeof item === "string" ? normalizeReservationUrl(item) : normalizeReservationUrl(item.url);
      if (!url) return null;
      const provider = detectReservationProvider(url);
      if (!provider) return null;
      return {
        url,
        provider: provider.name,
        confidence: Math.max(typeof item === "string" ? 0 : item.confidence, scoreUrl(url)),
      } satisfies ReservationUrlMatch;
    })
    .filter((item): item is ReservationUrlMatch => Boolean(item));

  matches.sort((a, b) => b.confidence - a.confidence);
  return matches[0] || null;
}
