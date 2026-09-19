export type ReservationLinkSelection = {
  url: string | null;
  provider: string | null;
};

const PROVIDERS: Array<{ label: string; pattern: RegExp; score: number }> = [
  { label: "Resy", pattern: /(^|\.)resy\.com$/i, score: 100 },
  { label: "OpenTable", pattern: /(^|\.)opentable\.com$/i, score: 100 },
  { label: "SevenRooms", pattern: /(^|\.)sevenrooms\.com$/i, score: 100 },
  { label: "Tock", pattern: /(^|\.)(exploretock|tock)\.com$/i, score: 100 },
  { label: "Toast Tables", pattern: /(^|\.)toasttab\.com$/i, score: 95 },
  { label: "Yelp Reservations", pattern: /(^|\.)yelp\.com$/i, score: 90 },
  { label: "Quandoo", pattern: /(^|\.)quandoo\./i, score: 90 },
];

function normalizedHost(value: string) {
  try { return new URL(value).hostname.replace(/^www\./i, "").toLowerCase(); } catch { return ""; }
}

function providerForHost(hostname: string) {
  return PROVIDERS.find((provider) => provider.pattern.test(hostname)) || null;
}

export function selectBestReservationLink(sourceUrl: URL, links: string[]): ReservationLinkSelection {
  const sourceHost = sourceUrl.hostname.replace(/^www\./i, "").toLowerCase();
  const candidates = links.map((url, index) => {
    const host = normalizedHost(url);
    const provider = providerForHost(host);
    const external = Boolean(host && host !== sourceHost && !host.endsWith(`.${sourceHost}`));
    const bookingIntent = /reserv|book|table|dining|seat|ticket/i.test(url);
    const score = (provider?.score || 0) + (external ? 30 : 0) + (bookingIntent ? 10 : 0) - index / 100;
    return { url, provider: provider?.label || (external ? "External" : null), score, external };
  });

  const best = candidates
    .filter((candidate) => candidate.external || candidate.provider)
    .sort((a, b) => b.score - a.score)[0];

  return best ? { url: best.url, provider: best.provider || "External" } : { url: null, provider: null };
}
