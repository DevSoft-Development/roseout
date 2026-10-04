import "server-only";

import { getCredentialVaultProviderValues } from "@/lib/admin/credential-vault-runtime-source";
import { getPlaceDetailsNew, searchPlacesTextNew } from "@/lib/google/places-new-client";
import {
  MapboxSearchRoutingProvider,
  type MapboxSearchRoutingProviderOptions,
} from "@/lib/search/routing/mapboxSearchRoutingProvider";
import {
  createDataForSeoReviewTask,
  getDataForSeoReviewTask,
  searchDataForSeoBusinessListings,
  testDataForSeoCredential,
} from "@/lib/location-intelligence/v2/dataforseo";
import { searchBraveLocationContext } from "@/lib/location-intelligence/v2/brave";

export async function resolveGooglePlaceIds(textQuery: string, pageSize = 10) {
  const places = await searchPlacesTextNew(textQuery, {
    fieldMode: "ids-only",
    pageSize: Math.max(1, Math.min(20, Math.trunc(pageSize))),
    jobKey: "location-intelligence-v2-identity",
    priority: "high",
  });
  return places.map((place) => String(place.id || "").trim()).filter(Boolean);
}

export async function verifyGooglePlaceStatus(placeId: string) {
  const place = await getPlaceDetailsNew(placeId, {
    fieldMode: "rich",
    jobKey: "location-intelligence-v2-status-verification",
    priority: "high",
  });
  return {
    placeId: String(place.id || placeId),
    businessStatus: place.businessStatus || null,
    displayName: place.displayName?.text || null,
    formattedAddress: place.formattedAddress || null,
    location: place.location || null,
  };
}

export { createDataForSeoReviewTask, getDataForSeoReviewTask, searchDataForSeoBusinessListings, testDataForSeoCredential };

export async function braveContextSearch(query: string, count = 10) {
  return searchBraveLocationContext({
    name: query,
    count,
  });
}

export async function createVaultBackedMapboxRoutingProvider(
  options: Omit<MapboxSearchRoutingProviderOptions, "accessToken"> = {},
) {
  const values = await getCredentialVaultProviderValues("mapbox");
  const accessToken = String(values.accessToken || "").trim();
  if (!accessToken) throw new Error("mapbox_credentials_not_configured");
  return new MapboxSearchRoutingProvider({ ...options, accessToken });
}
