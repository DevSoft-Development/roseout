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
    maintenanceClass: "external_free",
  },
  {
    id: "dataforseo",
    enabled: true,
    capabilities: ["discovery", "business_profile", "reviews", "status_verification"],
    credentialRef: "dataforseo.login+password",
    priority: 90,
    paid: true,
    maintenanceClass: "external_paid",
  },
  {
    id: "mapbox",
    enabled: true,
    capabilities: ["geocoding", "routing"],
    credentialRef: "mapbox.accessToken",
    priority: 80,
    paid: true,
    maintenanceClass: "external_paid",
  },
  {
    id: "official_website",
    enabled: true,
    capabilities: ["website_discovery", "web_context", "status_verification"],
    credentialRef: null,
    priority: 95,
    paid: false,
    maintenanceClass: "external_free",
  },
  {
    id: "brave",
    enabled: true,
    capabilities: ["website_discovery", "web_context", "status_verification"],
    credentialRef: "brave.apiKey",
    priority: 70,
    paid: true,
    maintenanceClass: "external_paid",
  },
  {
    id: "public_geo",
    enabled: true,
    capabilities: ["geocoding", "public_geography"],
    credentialRef: null,
    priority: 60,
    paid: false,
    maintenanceClass: "external_free",
  },
  {
    id: "owner",
    enabled: true,
    capabilities: ["owner_profile"],
    credentialRef: null,
    priority: 120,
    paid: false,
    maintenanceClass: "first_party",
  },
  {
    id: "toh_internal",
    enabled: true,
    capabilities: ["behavior_signals"],
    credentialRef: null,
    priority: 110,
    paid: false,
    maintenanceClass: "internal",
  },
  {
    id: "azure_ai",
    enabled: true,
    capabilities: ["ai_extraction"],
    credentialRef: null,
    priority: 50,
    paid: false,
    maintenanceClass: "internal",
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
