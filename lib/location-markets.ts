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

export const ACTIVE_MARKET_KEYS = ["NYC_CORE", "LONG_ISLAND", "NORTHERN_NJ", "WESTCHESTER", "CONNECTICUT", "UNKNOWN"] as const;
export const LEGACY_NYC_MARKET_KEYS = ["BRONX_OUTER", "STATEN_ISLAND", "OUTER_NYC"] as const;
export const NORTH_JERSEY_MARKET_KEY = "NORTHERN_NJ" as const;

export type MarketKey = (typeof MARKET_KEYS)[number] | "CONNECTICUT" | "NORTH_JERSEY";
export type CanonicalMarketKey = Exclude<MarketKey, "NORTH_JERSEY" | "BRONX_OUTER" | "STATEN_ISLAND" | "OUTER_NYC">;
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
  NORTHERN_NJ: "North Jersey",
  NORTH_JERSEY: "North Jersey",
  WESTCHESTER: "Westchester",
  CONNECTICUT: "Connecticut",
  STATEN_ISLAND: "NYC Core",
  BRONX_OUTER: "NYC Core",
  OUTER_NYC: "NYC Core",
  UNKNOWN: "Unknown",
};

export const MARKET_CENTERS: Record<MarketKey, { latitude: number; longitude: number }> = {
  NYC_CORE: { latitude: 40.7580, longitude: -73.9855 },
  LONG_ISLAND: { latitude: 40.7282, longitude: -73.6343 },
  NORTHERN_NJ: { latitude: 40.7357, longitude: -74.1724 },
  NORTH_JERSEY: { latitude: 40.7357, longitude: -74.1724 },
  WESTCHESTER: { latitude: 41.0330, longitude: -73.7629 },
  CONNECTICUT: { latitude: 41.0534, longitude: -73.5387 },
  STATEN_ISLAND: { latitude: 40.5795, longitude: -74.1502 },
  BRONX_OUTER: { latitude: 40.8448, longitude: -73.8648 },
  OUTER_NYC: { latitude: 40.7580, longitude: -73.9855 },
  UNKNOWN: { latitude: 40.7580, longitude: -73.9855 },
};

export const MARKET_ALIASES: Record<MarketKey, string[]> = {
  NYC_CORE: ["nyc", "new york city", "new york", "new york ny", "manhattan", "brooklyn", "queens", "bronx", "the bronx", "staten island", "astoria", "lic", "long island city", "williamsburg", "harlem", "bushwick", "flushing", "jamaica", "jamaica ny", "forest hills", "downtown brooklyn", "dumbo", "upper east side", "upper west side", "lower east side", "soho", "tribeca", "chelsea", "midtown", "times square", "flatbush", "bed stuy", "bed-stuy", "crown heights", "park slope", "riverdale", "fordham", "pelham bay", "st george", "st. george", "saint george", "stapleton"],
  LONG_ISLAND: ["long island", "nassau", "nassau county", "suffolk", "suffolk county", "garden city", "huntington", "rockville centre", "rockville center", "farmingdale", "wantagh", "seaford", "east rockaway", "hempstead", "mineola", "westbury", "uniondale", "freeport", "bay shore", "patchogue", "melville", "roslyn", "great neck", "massapequa", "levittown", "hicksville", "commack", "babylon", "islip", "smithtown", "port jefferson"],
  NORTHERN_NJ: ["north jersey", "northern nj", "northern jersey", "nj near nyc", "jersey city", "hoboken", "newark", "montclair", "fort lee", "edgewater", "weehawken", "union city", "elizabeth", "hackensack", "bergen county", "hudson county", "essex county", "union county", "passaic county", "paterson", "clifton", "secaucus", "teaneck", "englewood", "new jersey", "nj"],
  NORTH_JERSEY: ["north jersey", "northern nj"],
  WESTCHESTER: ["westchester", "westchester county", "white plains", "yonkers", "new rochelle", "mount vernon", "scarsdale", "rye", "tarrytown", "peekskill", "dobbs ferry", "bronxville", "mamaroneck", "port chester", "ossining", "sleepy hollow", "hastings on hudson", "hastings-on-hudson", "harrison", "larchmont", "pleasantville", "chappaqua", "ardsley", "elmsford", "greenburgh", "irvington", "katonah", "bedford", "croton on hudson", "croton-on-hudson", "briarcliff manor"],
  CONNECTICUT: ["connecticut", "ct", "stamford", "norwalk", "greenwich", "bridgeport", "new haven", "fairfield", "westport", "danbury", "hartford", "fairfield county", "new haven county", "hartford county", "milford", "stratford", "trumbull", "darien", "new canaan"],
  STATEN_ISLAND: ["staten island"],
  BRONX_OUTER: ["bronx", "the bronx"],
  OUTER_NYC: ["outside nyc", "outside the city", "outer area", "outer areas", "near nyc", "nearby nyc", "around nyc", "outside manhattan", "near queens", "near brooklyn", "outside queens", "outside brooklyn", "not manhattan", "not in manhattan", "outside of manhattan"],
  UNKNOWN: [],
};

function normalizeText(input: unknown) { return String(input ?? "").toLowerCase().replace(/[’']/g, "").replace(/\bl\.i\.\b/g, "li").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim(); }
function hasPhrase(hay: string, phrase: string) { const p = normalizeText(phrase); return new RegExp(`(^|\\s)${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`).test(hay); }
function titleCase(value: string) { return value.split(/\s+/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ").replace(/\bNj\b/, "NJ"); }

export function normalizeMarketKey(market: unknown): CanonicalMarketKey {
  const raw = String(market ?? "").trim();
  const n = normalizeText(raw);
  if (!n) return "UNKNOWN";

  const repeatedCanonical = ([...ACTIVE_MARKET_KEYS, ...LEGACY_NYC_MARKET_KEYS, "NORTH_JERSEY"] as const)
    .find((key) => {
      const normalizedKey = normalizeText(key);
      return n === normalizedKey || new RegExp(`^(?:${normalizedKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?:\\s+${normalizedKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})+$`).test(n);
    });
  if (repeatedCanonical) {
    if (["BRONX_OUTER", "STATEN_ISLAND", "OUTER_NYC"].includes(repeatedCanonical)) return "NYC_CORE";
    if (repeatedCanonical === "NORTH_JERSEY") return NORTH_JERSEY_MARKET_KEY;
    return repeatedCanonical as CanonicalMarketKey;
  }

  if (["bronx outer", "staten island", "outer nyc"].includes(n) || ["BRONX_OUTER", "STATEN_ISLAND", "OUTER_NYC"].includes(raw.toUpperCase())) return "NYC_CORE";
  if (["north jersey", "northern nj", "northern jersey"].includes(n) || ["NORTH_JERSEY", "NORTHERN_NJ"].includes(raw.toUpperCase())) return NORTH_JERSEY_MARKET_KEY;
  for (const key of ACTIVE_MARKET_KEYS) if (normalizeText(key) === n || normalizeText(MARKET_DISPLAY_NAMES[key]) === n || MARKET_ALIASES[key].some((alias) => normalizeText(alias) === n)) return key as CanonicalMarketKey;
  return "UNKNOWN";
}

export function marketMatchesFilter(rowMarket: unknown, filterMarket: unknown) { return normalizeMarketKey(rowMarket) === normalizeMarketKey(filterMarket); }
export function getMarketAliases(market: MarketKey) { return MARKET_ALIASES[market] ?? MARKET_ALIASES[normalizeMarketKey(market)] ?? []; }
export function getMarketDisplayName(market: MarketKey) { return MARKET_DISPLAY_NAMES[market] ?? MARKET_DISPLAY_NAMES[normalizeMarketKey(market)] ?? MARKET_DISPLAY_NAMES.UNKNOWN; }
export function getMarketCenter(market: MarketKey) { return MARKET_CENTERS[market] ?? MARKET_CENTERS[normalizeMarketKey(market)] ?? MARKET_CENTERS.UNKNOWN; }
export function normalizeMarketInput(input: string): MarketKey | null { const key = normalizeMarketKey(input); if (key !== "UNKNOWN") return key; const n = normalizeText(input); for (const market of ACTIVE_MARKET_KEYS) if (MARKET_ALIASES[market].some((a) => hasPhrase(n, a))) return normalizeMarketKey(market); return null; }
export function isOuterAreaIntent(rawQuery: string) { const q = normalizeText(rawQuery); return MARKET_ALIASES.OUTER_NYC.some((a) => hasPhrase(q, a)) || /\b(outer|outside|nearby|around)\b.*\b(nyc|city|manhattan|queens|brooklyn)\b/.test(q); }
export function getMarketRadiusMiles(market: MarketKey, options?: { citySpecific?: boolean; outerAreaAllowed?: boolean }) { const m = normalizeMarketKey(market); if (m === "LONG_ISLAND") return options?.citySpecific ? 12 : 28; if (m === "NORTHERN_NJ") return options?.citySpecific ? 10 : 22; if (m === "WESTCHESTER") return options?.citySpecific ? 10 : 22; if (m === "CONNECTICUT") return options?.citySpecific ? 12 : 30; return 12; }
export function getAllowedPairingMarkets(primaryMarket: MarketKey, queryIntent?: { outerAreaAllowed?: boolean; nearQueens?: boolean; broadOuterArea?: boolean }): MarketKey[] { if (primaryMarket === "OUTER_NYC" || queryIntent?.broadOuterArea) return ["LONG_ISLAND", "NORTHERN_NJ", "WESTCHESTER", "CONNECTICUT", "NYC_CORE"]; if (normalizeMarketKey(primaryMarket) === "NYC_CORE" && (queryIntent?.outerAreaAllowed || queryIntent?.nearQueens)) return ["NYC_CORE", "LONG_ISLAND"]; return [normalizeMarketKey(primaryMarket)]; }
export function areMarketsPairable(a: MarketKey, b: MarketKey) { const am = normalizeMarketKey(a); const bm = normalizeMarketKey(b); if (am === bm) return true; return am === "UNKNOWN" || bm === "UNKNOWN"; }

export function inferMarketFromCityStateCounty(data: { city?: string | null; state?: string | null; borough?: string | null; county?: string | null; region?: string | null; address?: string | null; market?: string | null }): CanonicalMarketKey {
  const existing = normalizeMarketInput(data.market || ""); if (existing && normalizeMarketKey(existing) !== "UNKNOWN") return normalizeMarketKey(existing);
  const borough = normalizeText(data.borough); const county = normalizeText(data.county); const state = normalizeText(data.state); const hay = normalizeText([data.city, data.state, data.borough, data.county, data.region, data.address].filter(Boolean).join(" "));
  if (["manhattan", "brooklyn", "queens", "bronx", "staten island"].includes(borough)) return "NYC_CORE";
  if (state === "ny" && ["nassau", "suffolk"].includes(county)) return "LONG_ISLAND";
  if (state === "ny" && county === "westchester") return "WESTCHESTER";
  if (state === "nj" && ["hudson", "bergen", "essex", "union", "passaic"].includes(county)) return "NORTHERN_NJ";
  if (state === "ct") return "CONNECTICUT";
  for (const market of ["LONG_ISLAND", "NORTHERN_NJ", "WESTCHESTER", "CONNECTICUT", "NYC_CORE"] as const) if (MARKET_ALIASES[market].some((a) => hasPhrase(hay, a))) return normalizeMarketKey(market);
  return state === "ny" && (hay.includes("new york") || hay.includes("nyc")) ? "NYC_CORE" : "UNKNOWN";
}

export function detectRequestedMarket(rawQuery: string): MarketDetectionResult {
  const q = normalizeText(rawQuery);
  if (/\bnewark\b/.test(q) && /\b(de|delaware|ca|california|oh|ohio)\b/.test(q)) return { requestedMarket: null, resolvedMarket: "UNKNOWN", marketIntent: "unknown", allowedMarkets: [], geoStrictness: "none", radiusMiles: getMarketRadiusMiles("UNKNOWN"), outerAreaAllowed: false, originalGeo: rawQuery, locationDisplayName: null };
  const outer = isOuterAreaIntent(rawQuery);
  if (outer) return { requestedMarket: "OUTER_NYC", resolvedMarket: "OUTER_NYC", marketIntent: "outer_area", allowedMarkets: getAllowedPairingMarkets("OUTER_NYC", { broadOuterArea: true }), outerAreaAllowed: true, geoStrictness: "outer_area", radiusMiles: 45, originalGeo: rawQuery, locationDisplayName: "NYC nearby areas" };
  for (const market of ["NYC_CORE", "LONG_ISLAND", "NORTHERN_NJ", "WESTCHESTER", "CONNECTICUT"] as const) {
    const alias = [...MARKET_ALIASES[market]].sort((a,b)=>b.length-a.length).find((a)=>hasPhrase(q,a));
    if (!alias) continue;
    const resolvedMarket = normalizeMarketKey(market);
    return { requestedMarket: resolvedMarket, resolvedMarket, marketIntent: "explicit", allowedMarkets: [resolvedMarket], state: resolvedMarket === "NORTHERN_NJ" ? "NJ" : resolvedMarket === "CONNECTICUT" ? "CT" : "NY", geoStrictness: normalizeText(alias) === normalizeText(MARKET_DISPLAY_NAMES[resolvedMarket]) ? "market" : "city", radiusMiles: getMarketRadiusMiles(resolvedMarket, { citySpecific: true }), outerAreaAllowed: resolvedMarket !== "NYC_CORE", originalGeo: rawQuery, locationDisplayName: titleCase(alias), matchedAlias: alias };
  }
  return { requestedMarket: null, resolvedMarket: "NYC_CORE", marketIntent: "default", allowedMarkets: ["NYC_CORE"], geoStrictness: "none", radiusMiles: getMarketRadiusMiles("NYC_CORE"), outerAreaAllowed: false, originalGeo: rawQuery, locationDisplayName: null };
}
