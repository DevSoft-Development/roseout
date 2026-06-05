import type { GeoIntent } from "./types";

export type SearchMarket = {
  id: string;
  label: string;
  state: string;
  latitude: number;
  longitude: number;
  radiusMiles: number;
};

export type UserSearchLocation = {
  latitude?: number | null;
  longitude?: number | null;
  radiusMiles?: number | null;
  state?: string | null;
  label?: string | null;
};

export type ResolveSearchMarketInput = {
  geo: GeoIntent;
  selectedMarketId?: string | null;
  userLocation?: UserSearchLocation | null;
};

export type SearchMarketResolution = {
  originalGeo: GeoIntent;
  effectiveGeo: GeoIntent;
  marketApplied: boolean;
  marketReason: "explicit_geo" | "selected_market" | "user_location" | "platform_default" | "unknown_market" | null;
  market: SearchMarket | null;
};

export const SEARCH_MARKETS: Record<string, SearchMarket> = {
  nyc_long_island: {
    id: "nyc_long_island",
    label: "NYC + Long Island",
    state: "NY",
    latitude: 40.758,
    longitude: -73.9855,
    radiusMiles: 45,
  },
};

export const PLATFORM_DEFAULT_MARKET_ID = "nyc_long_island";

function cloneGeo(geo: GeoIntent): GeoIntent {
  return {
    ...geo,
    aliases: [...(geo.aliases ?? [])],
  };
}

function hasExplicitGeo(geo: GeoIntent) {
  return Boolean(
    geo.raw ||
      geo.neighborhood ||
      geo.city ||
      geo.borough ||
      geo.county ||
      geo.region ||
      geo.state ||
      (geo.latitude != null && geo.longitude != null) ||
      geo.geoStrictness !== "none",
  );
}

function geoFromMarket(geo: GeoIntent, market: SearchMarket): GeoIntent {
  return {
    ...geo,
    raw: geo.raw ?? null,
    state: market.state,
    aliases: [...(geo.aliases ?? []), market.label],
    latitude: market.latitude,
    longitude: market.longitude,
    radiusMiles: market.radiusMiles,
    geoStrictness: "default_market",
    defaultMarketId: market.id,
    defaultMarketLabel: market.label,
  };
}

function geoFromUserLocation(geo: GeoIntent, userLocation: UserSearchLocation): GeoIntent {
  return {
    ...geo,
    raw: userLocation.label ?? geo.raw ?? null,
    state: userLocation.state ?? geo.state ?? null,
    aliases: geo.aliases ?? [],
    latitude: userLocation.latitude ?? null,
    longitude: userLocation.longitude ?? null,
    radiusMiles: userLocation.radiusMiles ?? geo.radiusMiles ?? null,
    geoStrictness: "soft",
  };
}

export function resolveSearchMarket({
  geo,
  selectedMarketId,
  userLocation,
}: ResolveSearchMarketInput): SearchMarketResolution {
  const originalGeo = cloneGeo(geo);

  if (hasExplicitGeo(geo)) {
    return {
      originalGeo,
      effectiveGeo: cloneGeo(geo),
      marketApplied: false,
      marketReason: "explicit_geo",
      market: null,
    };
  }

  if (userLocation?.latitude != null && userLocation.longitude != null) {
    return {
      originalGeo,
      effectiveGeo: geoFromUserLocation(geo, userLocation),
      marketApplied: false,
      marketReason: "user_location",
      market: null,
    };
  }

  const requestedMarketId = selectedMarketId?.trim() || PLATFORM_DEFAULT_MARKET_ID;
  const market = SEARCH_MARKETS[requestedMarketId];

  if (!market) {
    return {
      originalGeo,
      effectiveGeo: cloneGeo(geo),
      marketApplied: false,
      marketReason: "unknown_market",
      market: null,
    };
  }

  return {
    originalGeo,
    effectiveGeo: geoFromMarket(geo, market),
    marketApplied: true,
    marketReason: selectedMarketId ? "selected_market" : "platform_default",
    market,
  };
}
