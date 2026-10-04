import "server-only";

import { getCredentialVaultProviderValues } from "@/lib/admin/credential-vault-runtime-source";
import { searchPlacesTextNew } from "@/lib/google/places-new-client";
import {
  MapboxSearchRoutingProvider,
  type MapboxSearchRoutingProviderOptions,
} from "@/lib/search/routing/mapboxSearchRoutingProvider";

export async function resolveGooglePlaceIds(textQuery: string, pageSize = 10) {
  const places = await searchPlacesTextNew(textQuery, {
    fieldMode: "ids-only",
    pageSize: Math.max(1, Math.min(20, Math.trunc(pageSize))),
    jobKey: "location-intelligence-v2-identity",
    priority: "high",
  });
  return places.map((place) => String(place.id || "").trim()).filter(Boolean);
}

async function dataForSeoCredentials() {
  const values = await getCredentialVaultProviderValues("dataforseo");
  const login = String(values.login || "").trim();
  const password = String(values.password || "").trim();
  if (!login || !password) throw new Error("dataforseo_credentials_not_configured");
  return { login, password };
}

export async function dataForSeoRequest<T = unknown>(
  path: string,
  tasks: readonly Record<string, unknown>[],
): Promise<T> {
  const { login, password } = await dataForSeoCredentials();
  const normalizedPath = String(path || "").startsWith("/") ? String(path) : `/${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`https://api.dataforseo.com${normalizedPath}`, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        authorization: `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(tasks),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`dataforseo_http_${response.status}`);
    if (!data || typeof data !== "object") throw new Error("dataforseo_invalid_response");
    return data as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("dataforseo_timeout");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function submitDataForSeoReviewTask(input: {
  googlePlaceId: string;
  depth?: number;
  locationName?: string;
  languageName?: string;
  tag?: string;
}) {
  const placeId = String(input.googlePlaceId || "").trim();
  if (!placeId) throw new Error("dataforseo_google_place_id_required");
  const task: Record<string, unknown> = {
    place_id: placeId,
    depth: Math.max(10, Math.min(1000, Math.trunc(input.depth || 50))),
    language_name: input.languageName || "English",
  };
  if (input.locationName) task.location_name = input.locationName;
  if (input.tag) task.tag = input.tag;
  return dataForSeoRequest("/v3/business_data/google/reviews/task_post", [task]);
}

export async function submitDataForSeoGoogleMapsDiscoveryTask(input: {
  keyword: string;
  locationName: string;
  languageName?: string;
  depth?: number;
  tag?: string;
}) {
  const keyword = String(input.keyword || "").trim();
  const locationName = String(input.locationName || "").trim();
  if (!keyword || !locationName) throw new Error("dataforseo_discovery_input_required");
  const task: Record<string, unknown> = {
    keyword,
    location_name: locationName,
    language_name: input.languageName || "English",
    depth: Math.max(10, Math.min(100, Math.trunc(input.depth || 20))),
  };
  if (input.tag) task.tag = input.tag;
  return dataForSeoRequest("/v3/serp/google/maps/task_post", [task]);
}

export async function braveContextSearch(query: string, count = 10) {
  const values = await getCredentialVaultProviderValues("brave");
  const apiKey = String(values.apiKey || "").trim();
  if (!apiKey) throw new Error("brave_credentials_not_configured");
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", String(query || "").trim());
  url.searchParams.set("count", String(Math.max(1, Math.min(20, Math.trunc(count)))));
  const response = await fetch(url, {
    cache: "no-store",
    headers: { accept: "application/json", "X-Subscription-Token": apiKey },
  });
  if (!response.ok) throw new Error(`brave_search_http_${response.status}`);
  const data = await response.json() as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
  };
  return data.web?.results || [];
}

export async function createVaultBackedMapboxRoutingProvider(
  options: Omit<MapboxSearchRoutingProviderOptions, "accessToken"> = {},
) {
  const values = await getCredentialVaultProviderValues("mapbox");
  const accessToken = String(values.accessToken || "").trim();
  if (!accessToken) throw new Error("mapbox_credentials_not_configured");
  return new MapboxSearchRoutingProvider({ ...options, accessToken });
}
