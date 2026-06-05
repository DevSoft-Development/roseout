import type { EnterpriseLocation, EnterprisePair, GeoIntent } from "./types";

export type DefaultMarket = {
  id: string;
  label: string;
  state: string;
  latitude: number;
  longitude: number;
  radiusMiles: number;
  primaryCities: string[];
  primaryBoroughs: string[];
  secondaryRegions: string[];
  secondaryCounties: string[];
  secondaryCities: string[];
};

export const DEFAULT_MARKET: DefaultMarket = {
  id: "nyc_long_island",
  label: "NYC + Long Island",
  state: "NY",
  latitude: 40.758,
  longitude: -73.9855,
  radiusMiles: 45,
  primaryCities: ["New York", "Brooklyn", "Queens", "Bronx", "Staten Island"],
  primaryBoroughs: ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"],
  secondaryRegions: ["Long Island"],
  secondaryCounties: ["Nassau", "Nassau County", "Suffolk", "Suffolk County"],
  secondaryCities: [
    "Hempstead",
    "Mineola",
    "Garden City",
    "Westbury",
    "Freeport",
    "Rockville Centre",
    "Long Beach",
    "Great Neck",
    "New Hyde Park",
    "Valley Stream",
    "Uniondale",
    "Levittown",
    "Hicksville",
    "Oyster Bay",
    "Farmingdale",
    "Melville",
    "Huntington",
    "Babylon",
    "Bay Shore",
    "Islip",
    "Brentwood",
    "Commack",
    "Smithtown",
    "Ronkonkoma",
    "Patchogue",
    "Riverhead",
    "Southampton",
    "East Hampton",
    "Montauk",
  ],
};

export function normalizeMarketText(value: unknown): string {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function hasFiniteGeoCoordinate(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

export function hasExplicitGeo(geo: Partial<GeoIntent> | null | undefined): boolean {
  return Boolean(
    geo?.raw ||
      geo?.city ||
      geo?.borough ||
      geo?.neighborhood ||
      geo?.county ||
      geo?.region ||
      geo?.state ||
      hasFiniteGeoCoordinate(geo?.latitude) ||
      hasFiniteGeoCoordinate(geo?.longitude),
  );
}

export function applyDefaultMarketWhenMissing(geo: Partial<GeoIntent> | null | undefined) {
  if (hasExplicitGeo(geo)) {
    return {
      geo: geo as GeoIntent,
      defaultMarketApplied: false,
      defaultMarket: null,
    };
  }

  return {
    geo: {
      ...(geo || {}),
      raw: null,
      aliases: geo?.aliases ?? [],
      state: DEFAULT_MARKET.state,
      latitude: DEFAULT_MARKET.latitude,
      longitude: DEFAULT_MARKET.longitude,
      radiusMiles: DEFAULT_MARKET.radiusMiles,
      geoStrictness: "default_market" as const,
      defaultMarketId: DEFAULT_MARKET.id,
      defaultMarketLabel: DEFAULT_MARKET.label,
    } as GeoIntent,
    defaultMarketApplied: true,
    defaultMarket: DEFAULT_MARKET,
  };
}

export function isDefaultMarketAppliedGeo(geo: Partial<GeoIntent> | null | undefined): boolean {
  return geo?.geoStrictness === "default_market" || geo?.defaultMarketId === DEFAULT_MARKET.id;
}

export function isNycMarketLocation(location: Partial<EnterpriseLocation> | null | undefined): boolean {
  const city = normalizeMarketText(location?.city);
  const borough = normalizeMarketText(location?.borough);
  const county = normalizeMarketText(location?.county);
  const state = normalizeMarketText(location?.state);

  if (state && state !== "ny" && state !== "new york") return false;

  const nycValues = [
    "new york",
    "manhattan",
    "brooklyn",
    "queens",
    "bronx",
    "staten island",
    "kings",
    "kings county",
    "queens county",
    "bronx county",
    "richmond",
    "richmond county",
    "new york county",
  ];

  return nycValues.includes(city) || nycValues.includes(borough) || nycValues.includes(county);
}

export function isLongIslandMarketLocation(location: Partial<EnterpriseLocation> | null | undefined): boolean {
  const city = normalizeMarketText(location?.city);
  const county = normalizeMarketText(location?.county);
  const region = normalizeMarketText(location?.region);
  const state = normalizeMarketText(location?.state);

  if (state && state !== "ny" && state !== "new york") return false;

  const counties = DEFAULT_MARKET.secondaryCounties.map(normalizeMarketText);
  const regions = DEFAULT_MARKET.secondaryRegions.map(normalizeMarketText);
  const cities = DEFAULT_MARKET.secondaryCities.map(normalizeMarketText);

  return counties.includes(county) || regions.includes(region) || cities.includes(city);
}

export function getDefaultMarketTier(location: Partial<EnterpriseLocation> | null | undefined): number {
  if (isNycMarketLocation(location)) return 0;
  if (isLongIslandMarketLocation(location)) return 1;

  const state = normalizeMarketText(location?.state);
  if (state === "ny" || state === "new york") return 2;

  if (!state) return 4;

  return 3;
}

export function isInDefaultMarket(location: Partial<EnterpriseLocation> | null | undefined): boolean {
  return getDefaultMarketTier(location) <= 1;
}

function hasLocationCoordinates(location: Partial<EnterpriseLocation> | null | undefined): boolean {
  return hasFiniteGeoCoordinate(location?.latitude) && hasFiniteGeoCoordinate(location?.longitude);
}

export function getPairDefaultMarketPriority(pair: Partial<EnterprisePair> & { restaurantLocation?: EnterpriseLocation; activityLocation?: EnterpriseLocation }): number {
  const restaurant = pair.restaurant || pair.restaurantLocation || (pair as EnterpriseLocation);
  const activity = pair.activity || pair.activityLocation || (pair as EnterpriseLocation);
  const restaurantTier = getDefaultMarketTier(restaurant);
  const activityTier = getDefaultMarketTier(activity);

  if (!hasLocationCoordinates(restaurant) || !hasLocationCoordinates(activity)) return 4;
  if (restaurantTier === 4 || activityTier === 4) return 4;

  const worstTier = Math.max(restaurantTier, activityTier);

  if (worstTier === 0) return 0;
  if (worstTier === 1) return 1;
  if (worstTier === 2) return 2;
  if (worstTier === 3) return 3;

  return 4;
}
