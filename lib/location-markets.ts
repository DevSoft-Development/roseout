export const MARKET_KEYS = [
  "NYC_CORE",
  "LONG_ISLAND",
  "NORTHERN_NJ",
  "WESTCHESTER",
  "STATEN_ISLAND",
  "BRONX_OUTER",
  "OUTER_NYC",
  "UNKNOWN",
] as const;

export type MarketKey = (typeof MARKET_KEYS)[number];
export type MarketIntent = "explicit" | "outer_area" | "inferred" | "default" | "unknown";
export type MarketDetectionResult = {
  requestedMarket: MarketKey | null;
  resolvedMarket: MarketKey;
  marketIntent: MarketIntent;
  allowedMarkets: MarketKey[];
  city?: string | null;
  state?: string | null;
  borough?: string | null;
  county?: string | null;
  geoStrictness: "none" | "soft" | "city" | "market" | "outer_area";
  radiusMiles: number;
  outerAreaAllowed: boolean;
  originalGeo?: string | null;
  locationDisplayName?: string | null;
  matchedAlias?: string | null;
};

export const MARKET_DISPLAY_NAMES: Record<MarketKey, string> = {
  NYC_CORE: "NYC Core",
  LONG_ISLAND: "Long Island",
  NORTHERN_NJ: "Northern Jersey",
  WESTCHESTER: "Westchester",
  STATEN_ISLAND: "Staten Island",
  BRONX_OUTER: "Bronx / Outer NYC",
  OUTER_NYC: "Outer NYC Area",
  UNKNOWN: "Unknown",
};

export const MARKET_CENTERS: Record<MarketKey, { latitude: number; longitude: number }> = {
  NYC_CORE: { latitude: 40.7580, longitude: -73.9855 },
  LONG_ISLAND: { latitude: 40.7282, longitude: -73.6343 },
  NORTHERN_NJ: { latitude: 40.7357, longitude: -74.1724 },
  WESTCHESTER: { latitude: 41.0330, longitude: -73.7629 },
  STATEN_ISLAND: { latitude: 40.5795, longitude: -74.1502 },
  BRONX_OUTER: { latitude: 40.8448, longitude: -73.8648 },
  OUTER_NYC: { latitude: 40.7580, longitude: -73.9855 },
  UNKNOWN: { latitude: 40.7580, longitude: -73.9855 },
};

export const MARKET_ALIASES: Record<MarketKey, string[]> = {
  NYC_CORE: ["nyc", "new york city", "manhattan", "brooklyn", "queens", "new york", "astoria", "lic", "long island city", "williamsburg", "harlem"],
  LONG_ISLAND: ["long island", "li", "nassau", "nassau county", "suffolk", "suffolk county", "garden city", "mineola", "westbury", "great neck", "roslyn", "manhasset", "rockville centre", "rockville center", "freeport", "hempstead", "uniondale", "long beach", "valley stream", "huntington", "farmingdale", "babylon", "bay shore", "deer park", "melville", "commack", "patchogue", "smithtown"],
  NORTHERN_NJ: ["jersey", "new jersey", "nj", "northern jersey", "north jersey", "jersey city", "hoboken", "edgewater", "fort lee", "englewood", "teaneck", "hackensack", "montclair", "newark", "elizabeth", "union", "west orange", "paramus", "clifton"],
  WESTCHESTER: ["westchester", "westchester county", "yonkers", "new rochelle", "white plains", "mount vernon", "bronxville", "tarrytown"],
  STATEN_ISLAND: ["staten island", "st george", "st. george", "saint george", "stapleton", "new dorp", "tottenville"],
  BRONX_OUTER: ["bronx", "the bronx", "city island", "fordham", "mott haven", "riverdale", "pelham bay", "throgs neck"],
  OUTER_NYC: ["outside nyc", "outside the city", "outer area", "outer areas", "near nyc", "nearby nyc", "around nyc", "outside manhattan", "near queens", "near brooklyn", "outside queens", "outside brooklyn", "not manhattan", "not in manhattan", "outside of manhattan"],
  UNKNOWN: [],
};

const CITY_META: Record<string, { market: MarketKey; state: string; county?: string; borough?: string; display: string }> = Object.entries(MARKET_ALIASES).flatMap(([market, aliases]) => aliases.map((alias) => [alias.replace(/\./g, ""), market as MarketKey] as const)).reduce((acc, [alias, market]) => {
  if (["NYC_CORE", "OUTER_NYC", "UNKNOWN"].includes(market)) return acc;
  const state = market === "NORTHERN_NJ" ? "NJ" : "NY";
  const county = market === "LONG_ISLAND" ? (["huntington", "farmingdale", "babylon", "bay shore", "deer park", "melville", "commack", "patchogue", "smithtown", "suffolk", "suffolk county"].includes(alias) ? "Suffolk" : "Nassau") : market === "WESTCHESTER" ? "Westchester" : undefined;
  acc[alias] = { market, state, county, borough: market === "STATEN_ISLAND" ? "Staten Island" : market === "BRONX_OUTER" ? "Bronx" : undefined, display: titleCase(alias) };
  return acc;
}, {} as Record<string, { market: MarketKey; state: string; county?: string; borough?: string; display: string }>);

function normalizeText(input: unknown) { return String(input ?? "").toLowerCase().replace(/[’']/g, "").replace(/\bl\.i\.\b/g, "li").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim(); }
function hasPhrase(hay: string, phrase: string) { const p = normalizeText(phrase); return new RegExp(`(^|\\s)${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`).test(hay); }
function titleCase(value: string) { return value.split(/\s+/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ").replace(/\bNj\b/, "NJ"); }

export function getMarketAliases(market: MarketKey) { return MARKET_ALIASES[market] ?? []; }
export function getMarketDisplayName(market: MarketKey) { return MARKET_DISPLAY_NAMES[market] ?? MARKET_DISPLAY_NAMES.UNKNOWN; }
export function getMarketCenter(market: MarketKey) { return MARKET_CENTERS[market] ?? MARKET_CENTERS.UNKNOWN; }
export function normalizeMarketInput(input: string): MarketKey | null { const n = normalizeText(input); for (const market of MARKET_KEYS) if (MARKET_ALIASES[market].some((a) => hasPhrase(n, a)) || normalizeText(MARKET_DISPLAY_NAMES[market]) === n || normalizeText(market) === n) return market; return null; }
export function isOuterAreaIntent(rawQuery: string) { const q = normalizeText(rawQuery); return MARKET_ALIASES.OUTER_NYC.some((a) => hasPhrase(q, a)) || /\b(outer|outside|nearby|around)\b.*\b(nyc|city|manhattan|queens|brooklyn)\b/.test(q); }

export function getMarketRadiusMiles(market: MarketKey, options?: { citySpecific?: boolean; outerAreaAllowed?: boolean }) { if (market === "OUTER_NYC") return options?.outerAreaAllowed ? 45 : 25; if (market === "LONG_ISLAND") return options?.citySpecific ? 12 : 28; if (market === "NORTHERN_NJ") return options?.citySpecific ? 10 : 22; if (market === "WESTCHESTER") return options?.citySpecific ? 10 : 22; if (market === "STATEN_ISLAND") return 15; if (market === "BRONX_OUTER") return 12; return 12; }
export function getAllowedPairingMarkets(primaryMarket: MarketKey, queryIntent?: { outerAreaAllowed?: boolean; nearQueens?: boolean; broadOuterArea?: boolean }): MarketKey[] { if (primaryMarket === "OUTER_NYC" || queryIntent?.broadOuterArea) return ["LONG_ISLAND", "NORTHERN_NJ", "WESTCHESTER", "STATEN_ISLAND", "BRONX_OUTER"]; if (primaryMarket === "NYC_CORE" && (queryIntent?.outerAreaAllowed || queryIntent?.nearQueens)) return ["NYC_CORE", "LONG_ISLAND"]; return [primaryMarket]; }
export function areMarketsPairable(a: MarketKey, b: MarketKey) { if (a === b) return true; const set = new Set([a, b]); if (set.has("UNKNOWN")) return true; if (set.has("OUTER_NYC")) return false; if (set.has("STATEN_ISLAND") && set.has("NYC_CORE")) return true; if (set.has("BRONX_OUTER") && set.has("WESTCHESTER")) return true; return false; }
export function inferMarketFromCityStateCounty(data: { city?: string | null; state?: string | null; borough?: string | null; county?: string | null; region?: string | null; address?: string | null; market?: string | null }): MarketKey { const existing = normalizeMarketInput(data.market || ""); if (existing && existing !== "UNKNOWN") return existing; const borough = normalizeText(data.borough); const county = normalizeText(data.county); const city = normalizeText(data.city); const state = normalizeText(data.state); const hay = normalizeText([data.city, data.state, data.borough, data.county, data.region, data.address].filter(Boolean).join(" ")); if (["manhattan", "brooklyn", "queens"].includes(borough)) return "NYC_CORE"; if (borough === "bronx") return "BRONX_OUTER"; if (borough === "staten island") return "STATEN_ISLAND"; if (state === "ny" && ["nassau", "suffolk"].includes(county)) return "LONG_ISLAND"; if (state === "ny" && county === "westchester") return "WESTCHESTER"; if (state === "nj" && ["hudson", "bergen", "essex", "union", "passaic"].includes(county)) return "NORTHERN_NJ"; for (const market of ["LONG_ISLAND", "NORTHERN_NJ", "WESTCHESTER", "STATEN_ISLAND", "BRONX_OUTER"] as MarketKey[]) if (MARKET_ALIASES[market].some((a) => hasPhrase(city, a) || hasPhrase(hay, a))) return market; return state === "ny" && (hay.includes("new york") || hay.includes("nyc")) ? "NYC_CORE" : "UNKNOWN"; }

export function detectRequestedMarket(rawQuery: string): MarketDetectionResult { const q = normalizeText(rawQuery); const outer = isOuterAreaIntent(rawQuery); if (outer) { const nearQueens = hasPhrase(q, "near queens") || hasPhrase(q, "outside queens"); const allowed = nearQueens ? ["NYC_CORE", "LONG_ISLAND"] as MarketKey[] : getAllowedPairingMarkets("OUTER_NYC", { broadOuterArea: true }); return { requestedMarket: nearQueens ? "NYC_CORE" : "OUTER_NYC", resolvedMarket: nearQueens ? "NYC_CORE" : "OUTER_NYC", marketIntent: "outer_area", allowedMarkets: allowed, outerAreaAllowed: true, geoStrictness: "outer_area", radiusMiles: getMarketRadiusMiles("OUTER_NYC", { outerAreaAllowed: true }), originalGeo: rawQuery, locationDisplayName: nearQueens ? "Queens / nearby Long Island" : MARKET_DISPLAY_NAMES.OUTER_NYC } }
  for (const market of ["LONG_ISLAND", "NORTHERN_NJ", "WESTCHESTER", "STATEN_ISLAND", "BRONX_OUTER", "NYC_CORE"] as MarketKey[]) { const alias = MARKET_ALIASES[market].sort((a,b)=>b.length-a.length).find((a)=>hasPhrase(q,a)); if (!alias) continue; const meta = CITY_META[normalizeText(alias).replace(/\./g, "")]; const citySpecific = Boolean(meta && normalizeText(alias) !== normalizeText(MARKET_DISPLAY_NAMES[market])); return { requestedMarket: market, resolvedMarket: market, marketIntent: "explicit", allowedMarkets: [market], city: meta?.display && !["Bronx", "Staten Island"].includes(meta.display) ? meta.display : undefined, state: meta?.state ?? (market === "NORTHERN_NJ" ? "NJ" : "NY"), borough: meta?.borough, county: meta?.county, geoStrictness: citySpecific ? "city" : "market", radiusMiles: getMarketRadiusMiles(market, { citySpecific }), outerAreaAllowed: market !== "NYC_CORE", originalGeo: rawQuery, locationDisplayName: citySpecific ? meta?.display : MARKET_DISPLAY_NAMES[market], matchedAlias: alias }; }
  return { requestedMarket: null, resolvedMarket: "NYC_CORE", marketIntent: "default", allowedMarkets: ["NYC_CORE"], geoStrictness: "none", radiusMiles: getMarketRadiusMiles("NYC_CORE"), outerAreaAllowed: false, originalGeo: rawQuery, locationDisplayName: null };
}
