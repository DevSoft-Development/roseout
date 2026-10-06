export const RESERVATION_PROVIDERS = [
  ["opentable.com", "OpenTable"], ["exploretock.com", "Tock"],
  ["sevenrooms.com", "SevenRooms"], ["book.squareup.com", "Square"],
  ["eventbrite.com", "Eventbrite"], ["mindbodyonline.com", "Mindbody"], ["fareharbor.com", "FareHarbor"],
  ["peek.com", "Peek"], ["calendly.com", "Calendly"], ["tablecheck.com", "TableCheck"],
  ["tablescheck.com", "TableCheck"], ["eatapp.co", "Eat App"], ["simpleerb.com", "SimpleERB"],
  ["roller.app", "ROLLER"], ["bookeo.com", "Bookeo"], ["acuityscheduling.com", "Acuity Scheduling"],
  ["checkfront.com", "Checkfront"], ["rezdy.com", "Rezdy"], ["xola.com", "Xola"],
  ["bokun.io", "Bokun"], ["bookingkit.net", "Bookingkit"], ["getoccasion.com", "Occasion"],
] as const;

export const RESERVATION_DISCOVERY_PATHS = [
  "/", "/reservations", "/reservation", "/reserve", "/booking", "/book",
  "/book-a-table", "/book-now", "/dining", "/visit", "/contact",
] as const;

const NON_CRAWLABLE_WEBSITE_HOSTS = [
  "instagram.com", "facebook.com", "tiktok.com", "twitter.com", "x.com",
  "order.online", "order.toasttab.com", "doordash.com", "grubhub.com", "ubereats.com",
] as const;

export const MAX_RESERVATION_DISCOVERY_PAGES = 12;
const RESERVATION_FETCH_TIMEOUT_MS = 7000;
const RESERVATION_SITE_BUDGET_MS = 20000;
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
      return { status: "skipped", reason: "Approved OpenTable Directory API request/response contract is not configured in this repository yet" };
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

function isGenericProviderAsset(url: URL) {
  const host = venueHost(url);
  const path = url.pathname.toLowerCase();
  if (host === "waiver.roller.app") return true;
  if (path.endsWith(".js")) return true;
  if (path === "/pluginjs" || path === "/pluginjs/") return true;
  if (path.includes("/javascripts/")) return true;
  return false;
}

export function isNonCrawlableWebsite(value: string) {
  const normalized = normalizeUrl(value);
  if (!normalized) return false;
  const host = venueHost(new URL(normalized));
  return NON_CRAWLABLE_WEBSITE_HOSTS.some((candidate) => host === candidate || host.endsWith(`.${candidate}`));
}

function finishReservationMatch(url: URL, provider: string): ReservationMatch {
  url.protocol = "https:";
  url.hash = "";
  return { url: url.toString(), provider };
}

export function reservationMatch(candidate: string): ReservationMatch | null {
  try {
    const url = new URL(candidate);
    const host = venueHost(url);
    const path = url.pathname.toLowerCase();
    if (host === "yelp.com" || host.endsWith(".yelp.com")) {
      if (!path.includes("/reservations")) return null;
      return finishReservationMatch(url, "Yelp Reservations");
    }
    if (host === "resy.com" || host.endsWith(".resy.com")) {
      if (host === "widgets.resy.com") {
        const keys = Array.from(url.searchParams.keys()).map((key) => key.toLowerCase());
        const hasVenueIdentifier = keys.some((key) => ["venueid", "venue_id", "venue"].includes(key));
        if (!hasVenueIdentifier) return null;
      } else if (!path.includes("/venues/")) return null;
      return finishReservationMatch(url, "Resy");
    }
    if (host === "tables.toasttab.com") {
      if (!["/findtime", "/reserve", "/reservation"].some((segment) => path.includes(segment))) return null;
      return finishReservationMatch(url, "Toast");
    }
    if (host === "toasttab.com" || host.endsWith(".toasttab.com")) return null;
    if (isGenericProviderAsset(url)) return null;
    for (const [providerHost, provider] of RESERVATION_PROVIDERS) {
      if (host === providerHost || host.endsWith(`.${providerHost}`)) return finishReservationMatch(url, provider);
    }
  } catch { return null; }
  return null;
}

function addUrl(results: Set<string>, value: unknown, base: URL) {
  if (typeof value !== "string" || !value.trim()) return;
  try { results.add(new URL(value.trim(), base).toString()); } catch { /* ignore */ }
}

function collectJsonUrls(value: unknown, base: URL, results: Set<string>) {
  if (typeof value === "string") {
    if (/^(?:https?:\/\/|\/|\.\/|\.\.\/)/i.test(value.trim())) addUrl(results, value, base);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectJsonUrls(item, base, results);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (["url", "sameas", "target", "actionplatform", "contenturl", "embedurl"].includes(key.toLowerCase())) {
      collectJsonUrls(child, base, results);
    } else if (typeof child === "object") {
      collectJsonUrls(child, base, results);
    }
  }
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
  for (const match of decoded.matchAll(/(?:href|src|action|data-(?:url|href|src|link|booking-url|reservation-url))\s*=\s*["']([^"']+)["']/gi)) {
    try { results.add(new URL(match[1], base).toString()); } catch { /* ignore */ }
  }
  for (const match of decoded.matchAll(/(?:https?:\/\/|www\.)[^\s"'<>\\)\]]+/gi)) {
    const normalized = normalizeUrl(match[0]);
    if (normalized) results.add(normalized);
  }
  return [...results];
}

function isLikelyReservationPage(candidate: URL, home: URL) {
  if (venueHost(candidate) !== venueHost(home)) return false;
  const value = `${candidate.pathname} ${candidate.search}`.toLowerCase();
  return ["reserv", "book", "ticket", "schedule", "class", "experience", "visit", "dining", "table", "event", "appointment", "private-dining", "private-events"]
    .some((token) => value.includes(token));
}

function extractIntentLinks(html: string, base: URL, home: URL) {
  const results: URL[] = [];
  const intent = /\b(reserve|reservation|book|booking|book now|book a table|make a reservation|tickets?|schedule|appointment|private dining|private events?|experiences?)\b/i;
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!intent.test(text)) continue;
    try {
      const candidate = new URL(match[1], base);
      if (venueHost(candidate) === venueHost(home)) results.push(candidate);
    } catch { /* ignore */ }
  }
  return results;
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
        headers: {
          "User-Agent": "TheOutHavenBot/2.0 (+https://theouthaven.com)",
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
        },
      });
      if (response.status < 300 || response.status >= 400) return response;
      const location = response.headers.get("location");
      if (!location) return response;
      const next = new URL(location, current);
      if (venueHost(next) !== venueHost(home)) return response;
      current = next;
    } finally { clearTimeout(timeout); }
  }
  return null;
}

export async function discoverReservation(website: string): Promise<ReservationDiscoveryResult> {
  const normalized = normalizeUrl(website);
  if (!normalized) return { status: "failed", match: null, note: "Invalid website URL" };
  const home = new URL(normalized);
  const direct = reservationMatch(home.toString());
  if (direct) return { status: "found", match: direct, note: "Website is a reservation provider URL" };
  if (isNonCrawlableWebsite(home.toString())) {
    return { status: "not_found", match: null, note: `Skipped non-crawlable third-party website host: ${venueHost(home)}` };
  }

  let attempted = 0;
  let successfulChecks = 0;
  const startedAt = Date.now();
  let blockedChecks = 0;
  let failedChecks = 0;
  const failureNotes: string[] = [];
  const queue = [home, ...RESERVATION_DISCOVERY_PATHS.map((path) => new URL(path, home.origin))];
  const queued = new Set(queue.map((url) => url.toString()));
  const visited = new Set<string>();

  while (queue.length && attempted < MAX_RESERVATION_DISCOVERY_PAGES && Date.now() - startedAt < RESERVATION_SITE_BUDGET_MS) {
    const url = queue.shift()!;
    if (visited.has(url.toString())) continue;
    visited.add(url.toString());
    attempted += 1;
    try {
      const response = await fetchVenuePage(url, home);
      if (!response) { failedChecks += 1; continue; }
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (location) {
          const redirectMatch = reservationMatch(new URL(location, url).toString());
          if (redirectMatch) return { status: "found", match: redirectMatch, note: `Found via redirect from ${url.pathname}` };
        }
      }
      if (response.status === 403 || response.status === 429) { blockedChecks += 1; failureNotes.push(`${url.pathname}:${response.status}`); continue; }
      if (response.status >= 500) { failedChecks += 1; failureNotes.push(`${url.pathname}:${response.status}`); continue; }
      if (!response.ok) continue;
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("text/html")) continue;
      successfulChecks += 1;
      const html = await response.text();
      const links = extractReservationLinks(html, url);
      const matches = links.map(reservationMatch).filter(Boolean) as ReservationMatch[];
      const unique = [...new Map(matches.map((match) => [match.url, match])).values()];
      if (unique.length) return { status: "found", match: unique[0], note: `Found on ${url.pathname}` };
      const internalCandidates: URL[] = [];
      for (const link of links) {
        try {
          const candidate = new URL(link);
          if (isLikelyReservationPage(candidate, home)) internalCandidates.push(candidate);
        } catch { /* ignore malformed links */ }
      }
      internalCandidates.push(...extractIntentLinks(html, url, home));
      for (const candidate of internalCandidates) {
        const key = candidate.toString();
        if (!queued.has(key) && !visited.has(key)) { queue.unshift(candidate); queued.add(key); }
      }
    } catch (error) {
      failedChecks += 1;
      failureNotes.push(error instanceof Error ? error.message : "Website discovery failed");
    }
  }

  const budgetReached = Date.now() - startedAt >= RESERVATION_SITE_BUDGET_MS;
  if (successfulChecks > 0) return { status: "not_found", match: null, note: `Checked ${successfulChecks} successful page(s) across ${attempted} attempt(s)${budgetReached ? " before site time budget" : ""}` };
  if (blockedChecks > 0) return { status: "blocked", match: null, note: `Venue website blocked ${blockedChecks} request(s): ${failureNotes.slice(0, 3).join(", ")}` };
  if (failedChecks > 0) return { status: "failed", match: null, note: `Venue website failed ${failedChecks} request(s): ${failureNotes.slice(0, 3).join(", ")}` };
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
