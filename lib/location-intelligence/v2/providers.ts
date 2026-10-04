import "server-only";

import type { ProviderCapability, ProviderDescriptor } from "@/lib/location-intelligence/v2/contracts";

export const LOCATION_INTELLIGENCE_PROVIDER_REGISTRY: readonly ProviderDescriptor[] = [
  {
    id: "google",
    enabled: true,
    capabilities: ["identity", "status_verification"],
    credentialRef: "google.apiKey",
    priority: 100,
    paid: false,
  },
  {
    id: "dataforseo",
    enabled: true,
    capabilities: ["discovery", "business_profile", "reviews", "status_verification"],
    credentialRef: "dataforseo.apiKey",
    priority: 90,
    paid: true,
  },
  {
    id: "mapbox",
    enabled: true,
    capabilities: ["geocoding", "routing"],
    credentialRef: "mapbox.accessToken",
    priority: 80,
    paid: true,
  },
  {
    id: "official_website",
    enabled: true,
    capabilities: ["website_discovery", "web_context", "status_verification"],
    credentialRef: null,
    priority: 95,
    paid: false,
  },
  {
    id: "brave",
    enabled: true,
    capabilities: ["website_discovery", "web_context", "status_verification"],
    credentialRef: "brave.apiKey",
    priority: 70,
    paid: true,
  },
  {
    id: "public_geo",
    enabled: true,
    capabilities: ["geocoding"],
    credentialRef: null,
    priority: 60,
    paid: false,
  },
] as const;

export function providersForCapability(capability: ProviderCapability) {
  return LOCATION_INTELLIGENCE_PROVIDER_REGISTRY
    .filter((provider) => provider.enabled && provider.capabilities.includes(capability))
    .sort((a, b) => b.priority - a.priority);
}

export function providerDescriptor(providerId: string) {
  return LOCATION_INTELLIGENCE_PROVIDER_REGISTRY.find((provider) => provider.id === providerId) || null;
}
