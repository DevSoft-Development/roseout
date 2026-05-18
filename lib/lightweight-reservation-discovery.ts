import {
  chooseBestReservationUrl,
  extractReservationUrlsFromText,
  normalizeReservationUrl,
  type ReservationUrlMatch,
} from "./reservation-providers";

export type LightweightDiscoveryResult = {
  status: "found" | "not_found" | "blocked" | "failed";
  match: ReservationUrlMatch | null;
  checkedUrls: string[];
  error?: string;
};

const DISCOVERY_PATHS = ["/", "/reservations", "/reserve", "/book"];
const BLOCKED_STATUSES = new Set([403, 429]);

function withTimeout(ms: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { controller, timeout };
}

function resolveHomepageUrl(website: string) {
  try {
    const url = new URL(website);
    url.hash = "";
    return url;
  } catch {
    try {
      return new URL(`https://${website}`);
    } catch {
      return null;
    }
  }
}

function extractAttributeUrls(html: string) {
  const urls: string[] = [];
  const attributeRegex = /(?:href|src)\s*=\s*["']([^"']+)["']/gi;
  for (const match of html.matchAll(attributeRegex)) {
    urls.push(match[1]);
  }
  return urls;
}

function absolutize(candidate: string, base: URL) {
  try {
    return new URL(candidate, base).toString();
  } catch {
    return candidate;
  }
}

async function fetchHtml(url: URL) {
  const { controller, timeout } = withTimeout(9000);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "User-Agent": "TheOutHavenBot/1.0 (+https://theouthaven.com)",
        Accept: "text/html",
      },
    });
    const contentType = response.headers.get("content-type") || "";
    const text = contentType.includes("text/html") ? await response.text() : "";
    return { response, text };
  } finally {
    clearTimeout(timeout);
  }
}

export async function discoverReservationFromWebsite(website: string): Promise<LightweightDiscoveryResult> {
  const homepage = resolveHomepageUrl(website);
  if (!homepage) {
    return { status: "failed", match: null, checkedUrls: [], error: "Invalid website URL" };
  }

  if (normalizeReservationUrl(homepage.toString())) {
    const match = chooseBestReservationUrl([homepage.toString()]);
    return { status: match ? "found" : "not_found", match, checkedUrls: [homepage.toString()] };
  }

  const checkedUrls: string[] = [];
  const maxRequests = 3;

  for (const path of DISCOVERY_PATHS) {
    if (checkedUrls.length >= maxRequests) break;
    const url = new URL(path, homepage.origin);
    checkedUrls.push(url.toString());

    try {
      const { response, text } = await fetchHtml(url);
      if (BLOCKED_STATUSES.has(response.status)) {
        return {
          status: "blocked",
          match: null,
          checkedUrls,
          error: `Website returned ${response.status}`,
        };
      }
      if (!response.ok) continue;

      const inlineMatches = extractReservationUrlsFromText(text);
      const attributeMatches = extractAttributeUrls(text)
        .map((candidate) => absolutize(candidate, url))
        .map((candidate) => normalizeReservationUrl(candidate))
        .filter((candidate): candidate is string => Boolean(candidate));
      const best = chooseBestReservationUrl([...inlineMatches, ...attributeMatches]);
      if (best) return { status: "found", match: best, checkedUrls };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Website discovery failed";
      return { status: "failed", match: null, checkedUrls, error: message };
    }
  }

  return { status: "not_found", match: null, checkedUrls };
}
