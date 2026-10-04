import "server-only";

import type {
  LocationIntelligenceProviderAdapter,
  LocationProviderRequest,
  LocationProviderResponse,
  ProviderCapability,
} from "@/lib/location-intelligence/v2/contracts";
import { providersForCapability, providerDescriptor } from "@/lib/location-intelligence/v2/providers";
import {
  braveContextSearch,
  createDataForSeoReviewTask,
  resolveGooglePlaceIds,
  searchDataForSeoBusinessListings,
} from "@/lib/location-intelligence/v2/provider-executors";

class Adapter implements LocationIntelligenceProviderAdapter {
  constructor(
    readonly descriptor: NonNullable<ReturnType<typeof providerDescriptor>>,
    private readonly handler: (request: LocationProviderRequest) => Promise<unknown>,
  ) {}
  supports(capability: ProviderCapability) {
    return this.descriptor.enabled && this.descriptor.capabilities.includes(capability);
  }
  async execute(request: LocationProviderRequest): Promise<LocationProviderResponse> {
    if (!this.supports(request.capability)) throw new Error(`provider_capability_not_supported:${this.descriptor.id}:${request.capability}`);
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
  new Adapter(descriptor("google"), async ({ input }) =>
    resolveGooglePlaceIds(String(input.query || ""), Number(input.limit || 10))),
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
    });
  }),
  new Adapter(descriptor("brave"), async ({ input }) =>
    braveContextSearch(String(input.query || ""), Number(input.count || 10))),
  ...["mapbox","official_website","public_geo","owner","toh_internal","azure_ai"].map((id) =>
    new Adapter(descriptor(id), async ({ input }) => input)
  ),
];

export function adaptersForCapability(capability: ProviderCapability) {
  const allowed = new Set(providersForCapability(capability).map((provider) => provider.id));
  return LOCATION_INTELLIGENCE_ADAPTERS.filter((adapter) => allowed.has(adapter.descriptor.id));
}

export async function executeWithProviderFallback(request: LocationProviderRequest) {
  const errors: Array<{ providerId: string; error: string }> = [];
  for (const adapter of adaptersForCapability(request.capability)) {
    try {
      return await adapter.execute(request);
    } catch (error) {
      errors.push({
        providerId: adapter.descriptor.id,
        error: error instanceof Error ? error.message : "provider_failed",
      });
    }
  }
  throw new Error(`location_intelligence_provider_exhausted:${request.capability}:${JSON.stringify(errors)}`);
}
