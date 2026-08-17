export const RESERVATION_PROVIDERS = [
  ["resy.com", "Resy"], ["opentable.com", "OpenTable"], ["exploretock.com", "Tock"],
  ["sevenrooms.com", "SevenRooms"], ["book.squareup.com", "Square"], ["toasttab.com", "Toast"],
  ["eventbrite.com", "Eventbrite"], ["mindbodyonline.com", "Mindbody"], ["fareharbor.com", "FareHarbor"],
  ["peek.com", "Peek"], ["calendly.com", "Calendly"], ["tablecheck.com", "TableCheck"],
  ["tablescheck.com", "TableCheck"], ["eatapp.co", "Eat App"], ["simpleerb.com", "SimpleERB"],
] as const;

export const RESERVATION_DISCOVERY_PATHS = [
  "/", "/reservations", "/reservation", "/reserve", "/booking", "/book",
  "/book-a-table", "/book-now", "/dining", "/visit", "/contact",
] as const;

export const MAX_RESERVATION_DISCOVERY_PAGES = 6;
const RESERVATION_FETCH_TIMEOUT_MS = 7000;
const MAX_SAME_VENUE_REDIRECTS = 3;

export type ReservationMatch = { url: string; provider: string };
export type ReservationDiscoveryResult = {
  status: "found" | "not_found" | "blocked" | "failed";
  match: ReservationMatch | null;
  note: string;
};

export type OpenTableLookupInput = {
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  phone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type OpenTableLookupResult =
  | { status: "found"; restaurantId: string; profileUrl?: string; reservationUrl: string }
  | { status: "not_found" | "ambiguous" | "skipped"; reason: string };

export interface OpenTableDirectoryAdapter {
  requested: boolean;
  configured: boolean;
  enabled: boolean;
  lookup(input: OpenTableLookupInput): Promise<OpenTableLookupResult>;
}

export function createOpenTableDirectoryAdapter(env: { get(name: string): string | undefined }): OpenTableDirectoryAdapter {
  const requested = String(env.get("OPENTABLE_API_ENABLED") || "").toLowerCase() === "true";
  const baseUrl = String(env.get("OPENTABLE_API_BASE_URL") || "").trim();
  const apiKey = String(env.get("OPENTABLE_API_KEY") || "").trim();
  const configured = Boolean(baseUrl && apiKey);
  return {
    requested,
    configured,
    enabled: requested && configured,
    async lookup(_input: OpenTableLookupInput) {
      return {
        status: "skipped",
        reason: "Approved OpenTable Directory API request/response contract is not configured in this repository yet",
      };
    },
  };
}

function normalizeUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try { return new URL(value.trim()).toString(); }
  catch {
    try { return new URL(`https://${value.trim()}`).toString(); }
    catch { return null; }
  }
}

function venueHost(value: URL) {
  return value.hostname.toLowerCase().replace(/^www\./, "");
}

export function reservationMatch(candidate: string): ReservationMatch | null {
  try {
    const url = new URL(candidate);
    const host = venueHost(url);
    const path = url.pathname.toLowerCase();
    if (host === "yelp.com" || host.endsWith(".yelp.com")) {
      if (!path.includes("/reservations")) return null;
      url.protocol = "https:";
      url.hash = "";
      return { url: url.toString(), provider: "Yelp Reservations" };
    }
    for (const [providerHost, provider] of RESERVATION_PROVIDERS) {
      if (host === providerHost || host.endsWith(`.${providerHost}`)) {
        url.protocol = "https:";
        url.hash = "";
        return { url: url.toString(), provider };
      }
    }
  } catch { return null; }
  return null;
}

export function extractReservationLinks(html: string, base: URL) {
  const results = new Set<string>();
  const decoded = html
    .replace(/\\u0026/g, "&")
    .replace(/\\u003a/gi, ":")
    .replace(/\\u002f/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"');
  for (const match of decoded.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/gi)) {
    try { results.add(new URL(match[1], base).toString()); } catch { /* ignore */ }
  }
  for (const match of decoded.matchAll(/(?:https?:\/\/|www\.)[^\s"'<>\\)\]]+/gi)) {
    const normalized = normalizeUrl(match[0]);
    if (normalized) results.add(normalized);
  }
  return [...results];
}

async function fetchVenuePage(start: URL, home: URL) {
  let current = start;
  for (let redirects = 0; redirects <= MAX_SAME_VENUE_REDIRECTS; redirects += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RESERVATION_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(current, {
        signal: controller.signal,
        redirect: "manual",
        headers: { "User-Agent": "TheOutHavenBot/1.0 (+https://theouthaven.com)", "Accept": "text/html" },
      });
      if (response.status < 300 || response.status >= 400) return response;
      const location = response.headers.get("location");
      if (!location) return response;
      const next = new URL(location, current);
      if (venueHost(next) !== venueHost(home)) return response;
      current = next;
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
}

export async function discoverReservation(website: string): Promise<ReservationDiscoveryResult> {
  const normalized = normalizeUrl(website);
  if (!normalized) return { status: "failed", match: null, note: "Invalid website URL" };
  const home = new URL(normalized);
  const direct = reservationMatch(home.toString());
  if (direct) return { status: "found", match: direct, note: "Website is a reservation provider URL" };

  let attempted = 0;
  let successfulChecks = 0;
  let blockedChecks = 0;
  let failedChecks = 0;
  const failureNotes: string[] = [];

  for (const path of RESERVATION_DISCOVERY_PATHS.slice(0, MAX_RESERVATION_DISCOVERY_PAGES)) {
    attempted += 1;
    const url = new URL(path, home.origin);
    try {
      const response = await fetchVenuePage(url, home);
      if (!response) { failedChecks += 1; continue; }
      if (response.status === 403 || response.status === 429) {
        blockedChecks += 1;
        failureNotes.push(`${url.pathname}:${response.status}`);
        continue;
      }
      if (response.status >= 500) {
        failedChecks += 1;
        failureNotes.push(`${url.pathname}:${response.status}`);
        continue;
      }
      if (!response.ok) continue;
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("text/html")) continue;
      successfulChecks += 1;
      const matches = extractReservationLinks(await response.text(), url)
        .map(reservationMatch)
        .filter(Boolean) as ReservationMatch[];
      const unique = [...new Map(matches.map((match) => [match.url, match])).values()];
      if (unique.length) return { status: "found", match: unique[0], note: `Found on ${url.pathname}` };
    } catch (error) {
      failedChecks += 1;
      failureNotes.push(error instanceof Error ? error.message : "Website discovery failed");
    }
  }

  if (successfulChecks > 0) {
    return { status: "not_found", match: null, note: `Checked ${successfulChecks} successful page(s) across ${attempted} attempt(s)` };
  }
  if (blockedChecks > 0) {
    return { status: "blocked", match: null, note: `Venue website blocked ${blockedChecks} request(s): ${failureNotes.slice(0, 3).join(", ")}` };
  }
  if (failedChecks > 0) {
    return { status: "failed", match: null, note: `Venue website failed ${failedChecks} request(s): ${failureNotes.slice(0, 3).join(", ")}` };
  }
  return { status: "not_found", match: null, note: `Checked ${attempted} page candidate(s) with no provider link` };
}

export function reservationRecoveryPriority(row: Record<string, unknown>) {
  const status = String(row.reservation_discovery_status || "");
  const website = String(row.website || "").trim();
  if (status === "failed") return 0;
  if (status === "blocked") return 1;
  if (status === "no_website" && website) return 2;
  if (!status && website) return 3;
  return 4;
}
