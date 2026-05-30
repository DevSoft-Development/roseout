export type GeoIntent = {
  raw: string;
  normalized: string;
  terms: string[];
  geoType: "borough" | "neighborhood" | "city" | "state" | "county" | "region" | "area_group" | "mixed";
  borough?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  county?: string;
  counties?: string[];
  region?: string;
  area?: string;
  areaGroup?: string;
  aliases: string[];
};

export const NYC_BOROUGH_ALIASES: Record<string, string[]> = {
  queens: ["queens", "queens ny", "queens new york", "qns"],
  brooklyn: ["brooklyn", "brooklyn ny", "kings county", "bk"],
  manhattan: ["manhattan", "midtown", "downtown", "uptown"],
  bronx: ["bronx", "the bronx", "bronx ny"],
  "staten island": ["staten island", "staten island ny", "richmond county"],
};

export const NYC_NEIGHBORHOOD_ALIASES: Record<string, string[]> = {
  astoria: ["astoria", "astoria queens", "astoria ny"],
  jamaica: ["jamaica", "jamaica queens", "jamaica ny"],
  "long island city": ["long island city", "lic", "long island city queens"],
  flushing: ["flushing", "flushing queens"],
  "forest hills": ["forest hills", "forest hills queens"],
  williamsburg: ["williamsburg", "williamsburg brooklyn"],
  harlem: ["harlem", "harlem manhattan"],
  bushwick: ["bushwick", "bushwick brooklyn"],
  "bed stuy": ["bed stuy", "bedstuy", "bedford stuyvesant"],
};

export const STATE_ALIASES: Record<string, string[]> = {
  NY: ["ny", "new york", "new york state", "new york ny"],
  NJ: ["nj", "new jersey"],
  CT: ["ct", "connecticut"],
  PA: ["pa", "pennsylvania"],
};

const NASSAU_AREAS = [
  "glen cove", "long beach", "hempstead", "north hempstead", "oyster bay", "atlantic beach", "baldwin", "baldwin harbor", "bay park", "bellerose", "bellmore", "bethpage", "carle place", "cedarhurst", "east meadow", "east rockaway", "elmont", "farmingdale", "floral park", "franklin square", "freeport", "garden city", "glen head", "glenwood landing", "great neck", "great neck plaza", "greenvale", "hewlett", "hicksville", "inwood", "island park", "jericho", "lake success", "lakeview", "lawrence", "levittown", "locust valley", "lynbrook", "malverne", "manhasset", "massapequa", "massapequa park", "merrick", "mineola", "new cassel", "new hyde park", "north bellmore", "north massapequa", "north merrick", "north valley stream", "oceanside", "old bethpage", "old westbury", "plainview", "plainedge", "port washington", "rockville centre", "roosevelt", "roslyn", "roslyn heights", "sea cliff", "seaford", "south hempstead", "syosset", "uniondale", "valley stream", "wantagh", "west hempstead", "westbury", "woodbury", "woodmere",
];

const SUFFOLK_AREAS = [
  "babylon", "brookhaven", "east hampton", "huntington", "islip", "riverhead", "shelter island", "smithtown", "southampton", "southold", "amagansett", "amityville", "bay shore", "bayport", "bellport", "blue point", "bohemia", "brentwood", "bridgehampton", "brightwaters", "calverton", "center moriches", "centereach", "centerport", "central islip", "cold spring harbor", "commack", "copiague", "coram", "deer park", "dix hills", "east islip", "east northport", "east patchogue", "east quogue", "east setauket", "farmingville", "fire island", "greenlawn", "greenport", "hampton bays", "hauppauge", "holbrook", "holtsville", "huntington station", "islip terrace", "kings park", "lake grove", "lindenhurst", "manorville", "mastic", "mastic beach", "mattituck", "medford", "melville", "middle island", "miller place", "montauk", "mount sinai", "nesconset", "north babylon", "northport", "oakdale", "patchogue", "port jefferson", "port jefferson station", "remsenburg", "rocky point", "ronkonkoma", "sag harbor", "sagaponack", "sayville", "selden", "shirley", "speonk", "st james", "stony brook", "wading river", "water mill", "west babylon", "west islip", "westhampton", "westhampton beach", "wyandanch", "yaphank",
];

const LONG_ISLAND_REGION_ALIASES = ["long island", "long island ny", "li", "l i", "nassau and suffolk", "nassau suffolk"];
const NASSAU_ALIASES = ["nassau", "nassau county", "nassau county ny", "nassau ny"];
const SUFFOLK_ALIASES = ["suffolk", "suffolk county", "suffolk county ny", "suffolk ny"];
const LONG_ISLAND_AREA_GROUPS: Record<string, string[]> = {
  "north shore": ["north shore", "gold coast", "long island north shore"],
  "south shore": ["south shore", "long island south shore"],
  "east end": ["east end", "long island east end"],
  hamptons: ["hamptons", "the hamptons", "south fork", "east hampton", "southampton", "montauk", "bridgehampton", "sag harbor", "amagansett", "water mill", "westhampton", "westhampton beach", "quogue"],
  "north fork": ["north fork", "greenport", "southold", "mattituck", "cutchogue", "orient", "riverhead"],
};

const AREA_TO_COUNTY = new Map<string, string>([
  ...NASSAU_AREAS.map((area) => [area, "nassau"] as const),
  ...SUFFOLK_AREAS.map((area) => [area, "suffolk"] as const),
]);

const NEIGHBORHOOD_TO_BOROUGH: Record<string, string> = {
  astoria: "queens", jamaica: "queens", "long island city": "queens", flushing: "queens", "forest hills": "queens",
  williamsburg: "brooklyn", bushwick: "brooklyn", "bed stuy": "brooklyn", harlem: "manhattan",
};

export function normalizeGeoText(input: unknown): string {
  return String(input ?? "").toLowerCase().replace(/&/g, " and ").replace(/\bl\.i\.\b/g, "li").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function hasPhrase(hay: string, phrase: string) {
  const p = normalizeGeoText(phrase);
  return new RegExp(`(^|\\s)${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`).test(hay);
}

function firstMatch(q: string, map: Record<string, string[]>) {
  return Object.entries(map).flatMap(([key, aliases]) => aliases.map((alias) => ({ key, alias, normalized: normalizeGeoText(alias) }))).sort((a, b) => b.normalized.length - a.normalized.length).find((entry) => hasPhrase(q, entry.alias));
}

export function detectRequestedGeo(query: string): GeoIntent | null {
  const normalized = normalizeGeoText(query);
  if (!normalized) return null;
  const nycNeighborhood = firstMatch(normalized, NYC_NEIGHBORHOOD_ALIASES);
  if (nycNeighborhood) return { raw: query, normalized, terms: [nycNeighborhood.alias], geoType: "neighborhood", neighborhood: nycNeighborhood.key, borough: NEIGHBORHOOD_TO_BOROUGH[nycNeighborhood.key], city: "new york", state: "NY", aliases: NYC_NEIGHBORHOOD_ALIASES[nycNeighborhood.key] };
  const liRegion = LONG_ISLAND_REGION_ALIASES.find((a) => hasPhrase(normalized, a));
  if (liRegion) return { raw: query, normalized, terms: [liRegion], geoType: "region", region: "long_island", counties: ["nassau", "suffolk"], state: "NY", aliases: LONG_ISLAND_REGION_ALIASES };
  const areaGroup = firstMatch(normalized, LONG_ISLAND_AREA_GROUPS);
  if (areaGroup) return { raw: query, normalized, terms: [areaGroup.alias], geoType: "area_group", region: "long_island", county: areaGroup.key === "north fork" || areaGroup.key === "hamptons" || areaGroup.key === "east end" ? "suffolk" : undefined, areaGroup: areaGroup.key, state: "NY", aliases: LONG_ISLAND_AREA_GROUPS[areaGroup.key] };
  const countyAlias = NASSAU_ALIASES.find((a) => hasPhrase(normalized, a)) ? "nassau" : SUFFOLK_ALIASES.find((a) => hasPhrase(normalized, a)) ? "suffolk" : null;
  if (countyAlias) return { raw: query, normalized, terms: [countyAlias], geoType: "county", region: "long_island", county: countyAlias, state: "NY", aliases: countyAlias === "nassau" ? NASSAU_ALIASES : SUFFOLK_ALIASES };
  const area = [...AREA_TO_COUNTY.keys()].sort((a, b) => b.length - a.length).find((a) => hasPhrase(normalized, a));
  if (area) return { raw: query, normalized, terms: [area], geoType: "city", region: "long_island", county: AREA_TO_COUNTY.get(area), area, city: area, state: "NY", aliases: [area] };
  const borough = firstMatch(normalized, NYC_BOROUGH_ALIASES);
  if (borough) return { raw: query, normalized, terms: [borough.alias], geoType: "borough", borough: borough.key, city: "new york", state: "NY", aliases: NYC_BOROUGH_ALIASES[borough.key] };
  if (hasPhrase(normalized, "nyc") || hasPhrase(normalized, "new york city")) return { raw: query, normalized, terms: ["nyc"], geoType: "city", city: "new york", state: "NY", aliases: ["nyc", "new york city"] };
  for (const [state, aliases] of Object.entries(STATE_ALIASES)) if (aliases.some((a) => hasPhrase(normalized, a))) return { raw: query, normalized, terms: [state.toLowerCase()], geoType: "state", state, aliases };
  return null;
}

function geoHaystack(location: Record<string, unknown>) {
  const fields = ["address", "street_address", "formatted_address", "neighborhood", "borough", "city", "state", "state_code", "postal_code", "zip", "zip_code", "county", "search_document", "semantic_search_text"];
  return fields.map((f) => normalizeGeoText(location[f])).filter(Boolean).join(" ");
}

function field(location: Record<string, unknown>, name: string) { return normalizeGeoText(location[name]); }
function locationState(location: Record<string, unknown>) {
  return normalizeGeoText(
    location.state ??
    location.state_code ??
    location.region ??
    location.address ??
    location.formatted_address ??
    location.search_document ??
    ""
  );
}
function isClearlyOtherState(location: Record<string, unknown>, allowedState: string) {
  const hay = locationState(location);
  if (!hay) return false;

  const otherStates = allowedState === "NY"
    ? ["new jersey", " nj ", "connecticut", " ct ", "pennsylvania", " pa "]
    : [];

  return otherStates.some((token) => ` ${hay} `.includes(token));
}
function stateMatches(location: Record<string, unknown>, state = "NY") { const s = field(location, "state"); const sc = field(location, "state_code"); return s === normalizeGeoText(state) || sc === normalizeGeoText(state) || (state === "NY" && s === "new york"); }
function locationHasAny(location: Record<string, unknown>, tokens: string[]) { const hay = geoHaystack(location); return tokens.some((token) => hasPhrase(hay, token)); }
function isNycOnly(location: Record<string, unknown>) { return locationHasAny(location, ["queens", "brooklyn", "manhattan", "bronx", "staten island", ...Object.keys(NYC_NEIGHBORHOOD_ALIASES)]); }

function hasAnyPhrase(hay: string, phrases: string[]) {
  return phrases.some((phrase) => hasPhrase(hay, phrase));
}

function boroughFromLocation(location: Record<string, unknown>) {
  const hay = geoHaystack(location);
  const borough = field(location, "borough");
  const city = field(location, "city");
  const neighborhood = field(location, "neighborhood");

  for (const [boroughName, aliases] of Object.entries(NYC_BOROUGH_ALIASES)) {
    if (borough === boroughName) return boroughName;
    if (hasAnyPhrase(borough, aliases)) return boroughName;
    if (hasAnyPhrase(city, aliases)) return boroughName;
    if (hasAnyPhrase(neighborhood, aliases)) return boroughName;
    if (hasAnyPhrase(hay, aliases)) return boroughName;
  }

  for (const [neighborhoodName, mappedBorough] of Object.entries(NEIGHBORHOOD_TO_BOROUGH)) {
    if (
      hasPhrase(neighborhood, neighborhoodName) ||
      hasPhrase(city, neighborhoodName) ||
      hasPhrase(hay, neighborhoodName)
    ) {
      return mappedBorough;
    }
  }

  return null;
}

function exactNeighborhoodMatch(location: Record<string, unknown>, neighborhood: string) {
  const hay = geoHaystack(location);
  const city = field(location, "city");
  const locationNeighborhood = field(location, "neighborhood");
  const address = field(location, "address");
  const formattedAddress = field(location, "formatted_address");

  const aliases = NYC_NEIGHBORHOOD_ALIASES[neighborhood] ?? [neighborhood];

  return aliases.some((alias) => {
    return (
      hasPhrase(locationNeighborhood, alias) ||
      hasPhrase(city, alias) ||
      hasPhrase(address, alias) ||
      hasPhrase(formattedAddress, alias) ||
      hasPhrase(hay, alias)
    );
  });
}

function sameRequestedBorough(location: Record<string, unknown>, requestedBorough?: string | null) {
  if (!requestedBorough) return false;
  return boroughFromLocation(location) === normalizeGeoText(requestedBorough);
}

export function isExactRequestedNeighborhoodMatch(
  location: Record<string, unknown>,
  geoIntent?: GeoIntent | null,
) {
  if (!geoIntent?.neighborhood) return false;
  return exactNeighborhoodMatch(location, geoIntent.neighborhood);
}

export function isSameRequestedBoroughMatch(
  location: Record<string, unknown>,
  geoIntent?: GeoIntent | null,
) {
  if (!geoIntent?.borough) return false;
  return sameRequestedBorough(location, geoIntent.borough);
}

export function scoreGeoMatch(location: Record<string, unknown>, geoIntent?: GeoIntent | null): number {
  if (!geoIntent) return 0;
  let score = 0;
  if (
    geoIntent.state === "NY" &&
    ["borough", "neighborhood", "city"].includes(geoIntent.geoType) &&
    isClearlyOtherState(location, "NY")
  ) {
    score -= 500;
  }
  const hay = geoHaystack(location);
  const county = field(location, "county");
  const city = field(location, "city");
  const neighborhood = field(location, "neighborhood");
  const borough = field(location, "borough");

  if (geoIntent.region === "long_island") {
    const requestedArea = geoIntent.area;
    if (requestedArea && [city, neighborhood, borough].some((v) => hasPhrase(v, requestedArea)) || (requestedArea && hasPhrase(hay, requestedArea))) score += 100;
    if (geoIntent.areaGroup && LONG_ISLAND_AREA_GROUPS[geoIntent.areaGroup]?.some((a) => hasPhrase(hay, a))) score += 85;
    const countyHit = geoIntent.county ? county.includes(geoIntent.county) : ["nassau", "suffolk"].some((c) => county.includes(c));
    if (countyHit) score += 75;
    if (locationHasAny(location, [...NASSAU_AREAS, ...SUFFOLK_AREAS, ...LONG_ISLAND_REGION_ALIASES])) score += 60;
    if (stateMatches(location, "NY")) score += 25;
    if (isNycOnly(location) && !countyHit && !locationHasAny(location, [...NASSAU_AREAS, ...SUFFOLK_AREAS])) score -= 100;
    if (["NJ", "CT", "PA"].some((state) => stateMatches(location, state))) score -= 100;
    return score;
  }

  if (geoIntent.neighborhood) {
    if (exactNeighborhoodMatch(location, geoIntent.neighborhood)) {
      score += 250;
    } else if (geoIntent.borough && sameRequestedBorough(location, geoIntent.borough)) {
      score += 80;
    } else {
      score -= 250;
    }
  }

  if (geoIntent.borough) {
    if (sameRequestedBorough(location, geoIntent.borough)) {
      score += 150;
    } else if (geoIntent.geoType === "borough") {
      score -= 200;
    }

    const knownNeighborhoods = Object.entries(NEIGHBORHOOD_TO_BOROUGH)
      .filter(([, b]) => b === geoIntent.borough)
      .map(([n]) => n);

    if (knownNeighborhoods.some((n) => hasPhrase(hay, n))) score += 60;
  }
  if (geoIntent.city && (city.includes(geoIntent.city) || hasPhrase(hay, geoIntent.city) || (geoIntent.city === "new york" && locationHasAny(location, Object.keys(NYC_BOROUGH_ALIASES))))) score += 50;
  if (geoIntent.state && stateMatches(location, geoIntent.state)) score += geoIntent.geoType === "state" ? 40 : 15;
  if (geoIntent.state && ["NJ", "CT", "PA"].some((state) => geoIntent.state !== state && stateMatches(location, state))) score -= 50;
  return score;
}

export function locationMatchesGeo(location: Record<string, unknown>, geoIntent?: GeoIntent | null): boolean {
  if (!geoIntent) return true;

  if (
    geoIntent.state === "NY" &&
    ["borough", "neighborhood", "city"].includes(geoIntent.geoType) &&
    isClearlyOtherState(location, "NY")
  ) {
    return false;
  }

  if (geoIntent.geoType === "neighborhood" && geoIntent.neighborhood) {
    if (exactNeighborhoodMatch(location, geoIntent.neighborhood)) return true;
    if (sameRequestedBorough(location, geoIntent.borough)) return true;
    return false;
  }

  if (geoIntent.geoType === "borough" && geoIntent.borough) {
    return sameRequestedBorough(location, geoIntent.borough);
  }

  if (geoIntent.region === "long_island") {
    const county = field(location, "county");

    const hasLongIslandCountyOrAreaSignal =
      ["nassau", "suffolk"].some((c) => county.includes(c)) ||
      locationHasAny(location, [...NASSAU_AREAS, ...SUFFOLK_AREAS]);

    if (hasLongIslandCountyOrAreaSignal) return true;

    if (isNycOnly(location)) return false;

    if (locationHasAny(location, LONG_ISLAND_REGION_ALIASES)) return true;

    return scoreGeoMatch(location, geoIntent) > 0;
  }

  return scoreGeoMatch(location, geoIntent) > 0;
}

export function describeGeoMatch(location: Record<string, unknown>, geoIntent?: GeoIntent | null) {
  const score = scoreGeoMatch(location, geoIntent);
  return { score, matches: !geoIntent || score > 0, geoType: geoIntent?.geoType ?? null, terms: geoIntent?.terms ?? [] };
}
