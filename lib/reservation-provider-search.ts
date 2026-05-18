import {
  RESERVATION_PROVIDERS,
  chooseBestReservationUrl,
  detectReservationProvider,
  normalizeReservationUrl,
  type ReservationUrlMatch,
} from "./reservation-providers";

export type ProviderSearchInput = {
  name: string;
  city?: string | null;
  state?: string | null;
};

export type ProviderSearchResult = ReservationUrlMatch & {
  title?: string;
  snippet?: string;
  source: "provider_search";
};

type RawSearchResult = {
  title?: string;
  snippet?: string;
  url?: string;
  link?: string;
};

const SEARCH_PROVIDER_HOSTS = [
  "resy.com",
  "opentable.com",
  "exploretock.com",
  "sevenrooms.com",
  "toasttab.com",
];

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenSet(value: string) {
  return new Set(normalizeText(value).split(/\s+/).filter((token) => token.length > 2));
}

function overlapScore(expected: string, haystack: string) {
  const expectedTokens = tokenSet(expected);
  if (!expectedTokens.size) return 0;
  const haystackTokens = tokenSet(haystack);
  let matches = 0;
  expectedTokens.forEach((token) => {
    if (haystackTokens.has(token)) matches += 1;
  });
  return matches / expectedTokens.size;
}

function scoreResult(input: ProviderSearchInput, result: RawSearchResult, normalizedUrl: string) {
  const provider = detectReservationProvider(normalizedUrl);
  if (!provider) return null;

  const haystack = [result.title, result.snippet, normalizedUrl].filter(Boolean).join(" ");
  const nameScore = overlapScore(input.name, haystack);
  const cityScore = input.city ? overlapScore(input.city, haystack) : 1;
  const stateScore = input.state ? overlapScore(input.state, haystack) : 1;
  const locationScore = Math.max(cityScore, stateScore);
  const confidence = Math.min(0.98, 0.45 + nameScore * 0.4 + locationScore * 0.13);

  return {
    url: normalizedUrl,
    provider: provider.name,
    confidence,
    title: result.title,
    snippet: result.snippet,
    source: "provider_search" as const,
  };
}

function buildQueries(input: ProviderSearchInput) {
  const city = input.city || "";
  return SEARCH_PROVIDER_HOSTS.map(
    (host) => `site:${host} "${input.name}"${city ? ` "${city}"` : ""}`,
  );
}

async function searchWithSerpApi(query: string): Promise<RawSearchResult[]> {
  const key = process.env.SERPAPI_API_KEY;
  if (!key) return [];

  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("num", "5");
  url.searchParams.set("api_key", key);

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`SerpApi search failed: ${response.status}`);
  const data = (await response.json()) as { organic_results?: RawSearchResult[] };
  return data.organic_results || [];
}

async function searchWithBrave(query: string): Promise<RawSearchResult[]> {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) return [];

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "5");

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": key,
    },
  });
  if (!response.ok) throw new Error(`Brave search failed: ${response.status}`);
  const data = (await response.json()) as { web?: { results?: RawSearchResult[] } };
  return data.web?.results || [];
}

async function runSearch(query: string) {
  if (process.env.SERPAPI_API_KEY) return searchWithSerpApi(query);
  if (process.env.BRAVE_SEARCH_API_KEY) return searchWithBrave(query);
  return [];
}

export function hasReservationProviderSearchConfig() {
  return Boolean(process.env.SERPAPI_API_KEY || process.env.BRAVE_SEARCH_API_KEY);
}

export async function discoverReservationViaProviderSearch(input: ProviderSearchInput) {
  if (!input.name || !hasReservationProviderSearchConfig()) {
    return { best: null, suggestions: [] as ProviderSearchResult[], searched: false };
  }

  const suggestions: ProviderSearchResult[] = [];
  for (const query of buildQueries(input)) {
    const results = await runSearch(query);
    for (const result of results) {
      const rawUrl = result.url || result.link;
      const normalizedUrl = normalizeReservationUrl(rawUrl);
      if (!normalizedUrl) continue;
      const scored = scoreResult(input, result, normalizedUrl);
      if (scored) suggestions.push(scored);
    }
  }

  const deduped = Array.from(new Map(suggestions.map((item) => [item.url, item])).values());
  deduped.sort((a, b) => b.confidence - a.confidence);
  const best = deduped[0]?.confidence >= 0.75 ? deduped[0] : null;

  return { best, suggestions: deduped, searched: true };
}

export function bestProviderCandidateFromUrls(urls: string[]) {
  const match = chooseBestReservationUrl(urls);
  if (!match) return null;
  const provider = RESERVATION_PROVIDERS.find((item) => item.name === match.provider);
  return provider ? match : null;
}
