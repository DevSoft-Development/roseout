import "server-only";

import type {
  LocationIntelligenceProviderAdapter,
  LocationProviderRequest,
  LocationProviderResponse,
  ProviderCapability,
} from "@/lib/location-intelligence/v2/contracts";
import { providersForCapability, providerDescriptor } from "@/lib/location-intelligence/v2/providers";
import { allowPaidProviderExecution } from "@/lib/location-intelligence/v2/policy";
import {
  braveContextSearch,
  createDataForSeoReviewTask,
  createVaultBackedMapboxRoutingProvider,
  resolveGooglePlaceIds,
  searchDataForSeoBusinessListings,
  serpApiContextSearch,
  verifyGooglePlaceStatus,
} from "@/lib/location-intelligence/v2/provider-executors";
import {
  fetchOfficialWebsiteContext,
  loadInternalSignals,
  loadOwnerProfile,
  loadPublicGeography,
  mapboxGeocodeAddress,
  runAzureExtraction,
} from "@/lib/location-intelligence/v2/source-executors";

class Adapter implements LocationIntelligenceProviderAdapter {
  constructor(
    readonly descriptor: NonNullable<ReturnType<typeof providerDescriptor>>,
    private readonly handler: (request: LocationProviderRequest) => Promise<unknown>,
  ) {}

  supports(capability: ProviderCapability) {
    return this.descriptor.enabled && this.descriptor.capabilities.includes(capability);
  }

  async execute(request: LocationProviderRequest): Promise<LocationProviderResponse> {
    if (!this.supports(request.capability)) {
      throw new Error(`provider_capability_not_supported:${this.descriptor.id}:${request.capability}`);
    }
    const purpose = request.purpose || "unspecified";
    const paidRequest = this.descriptor.paid ||
      (this.descriptor.id === "google" && request.capability === "status_verification");
    if (paidRequest && !allowPaidProviderExecution({
      purpose,
      ownerMaintained: request.ownerMaintained,
    })) {
      throw new Error(`paid_provider_execution_blocked:${this.descriptor.id}:${purpose}`);
    }
    return {
      providerId: this.descriptor.id,
      capability: request.capability,
      data: await this.handler(request),
    };
  }
}

function descriptor(id: string) {
  const value = providerDescriptor(id);
  if (!value) throw new Error(`provider_not_registered:${id}`);
  return value;
}

export const LOCATION_INTELLIGENCE_ADAPTERS: readonly LocationIntelligenceProviderAdapter[] = [
  new Adapter(descriptor("google"), async ({ capability, input }) => {
    if (capability === "identity") {
      return resolveGooglePlaceIds(String(input.query || ""), Number(input.limit || 10));
    }
    if (capability === "status_verification") {
      const placeId = String(input.googlePlaceId || input.placeId || "").trim();
      if (!placeId) throw new Error("google_status_place_id_required");
      return verifyGooglePlaceStatus(placeId);
    }
    throw new Error(`google_capability_not_supported:${capability}`);
  }),

  new Adapter(descriptor("dataforseo"), async ({ capability, input }) => {
    if (capability === "reviews") {
      return createDataForSeoReviewTask({
        googlePlaceId: String(input.googlePlaceId || "") || undefined,
        keyword: String(input.keyword || "") || undefined,
        locationName: String(input.locationName || "United States"),
        depth: Number(input.depth || 100),
        sortBy: "newest",
        tag: String(input.tag || "") || undefined,
      });
    }
    return searchDataForSeoBusinessListings({
      categories: Array.isArray(input.categories) ? input.categories.map(String) : undefined,
      title: String(input.title || "") || undefined,
      description: String(input.description || "") || undefined,
      locationCoordinate: String(input.locationCoordinate || "") || undefined,
      limit: Number(input.limit || 100),
      filters: Array.isArray(input.filters) ? input.filters : undefined,
    });
  }),

  new Adapter(descriptor("brave"), async ({ input }) =>
    braveContextSearch(String(input.query || ""), Number(input.count || 10))),

  new Adapter(descriptor("serpapi"), async ({ input }) =>
    serpApiContextSearch(String(input.query || ""), Number(input.count || 5))),

  new Adapter(descriptor("mapbox"), async ({ capability, input }) => {
    if (capability === "geocoding") {
      return mapboxGeocodeAddress(String(input.query || ""));
    }
    if (capability === "routing") {
      const provider = await createVaultBackedMapboxRoutingProvider();
      return provider.routeMatrix({
        mode: input.mode === "driving" ? "driving" : "walking",
        origins: Array.isArray(input.origins) ? input.origins as any[] : [],
        destinations: Array.isArray(input.destinations) ? input.destinations as any[] : [],
      });
    }
    throw new Error(`mapbox_capability_not_supported:${capability}`);
  }),

  new Adapter(descriptor("official_website"), async ({ input }) =>
    fetchOfficialWebsiteContext(String(input.url || ""))),

  new Adapter(descriptor("public_geo"), async ({ input }) =>
    loadPublicGeography(String(input.zipCode || ""))),

  new Adapter(descriptor("owner"), async ({ input }) =>
    loadOwnerProfile(String(input.locationId || ""))),

  new Adapter(descriptor("toh_internal"), async ({ input }) =>
    loadInternalSignals(String(input.locationId || ""))),

  new Adapter(descriptor("azure_ai"), async ({ input }) =>
    runAzureExtraction(input.data, String(input.instructions || "") || undefined)),
];

export function adaptersForCapability(capability: ProviderCapability) {
  const allowed = new Set(providersForCapability(capability).map((provider) => provider.id));
  return LOCATION_INTELLIGENCE_ADAPTERS.filter((adapter) => allowed.has(adapter.descriptor.id));
}

export function hasUsableProviderData(data: unknown): boolean {
  if (data == null) return false;
  if (Array.isArray(data)) return data.length > 0;
  if (typeof data === "string") return data.trim().length > 0;
  if (typeof data !== "object") return true;

  const value = data as Record<string, unknown>;
  const resultArrays = Object.entries(value)
    .filter(([key, entry]) => /results?$|places?$|items?$|matches?$/i.test(key) && Array.isArray(entry))
    .map(([, entry]) => entry as unknown[]);
  if (resultArrays.length > 0) return resultArrays.some((entry) => entry.length > 0);

  return Object.values(value).some((entry) => {
    if (entry == null) return false;
    if (Array.isArray(entry)) return entry.length > 0;
    if (typeof entry === "string") return entry.trim().length > 0;
    if (typeof entry === "object") return Object.keys(entry as Record<string, unknown>).length > 0;
    return true;
  });
}

export async function executeWithProviderFallback(request: LocationProviderRequest) {
  const errors: Array<{ providerId: string; error: string }> = [];
  for (const adapter of adaptersForCapability(request.capability)) {
    try {
      const response = await adapter.execute(request);
      if (hasUsableProviderData(response.data)) return response;
      errors.push({
        providerId: adapter.descriptor.id,
        error: "provider_result_inadequate",
      });
    } catch (error) {
      errors.push({
        providerId: adapter.descriptor.id,
        error: error instanceof Error ? error.message : "provider_failed",
      });
    }
  }
  throw new Error(`location_intelligence_provider_exhausted:${request.capability}:${JSON.stringify(errors)}`);
}
