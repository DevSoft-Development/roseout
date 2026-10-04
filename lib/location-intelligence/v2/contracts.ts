import "server-only";

export type TohLocationId = string;

export type LocationMaintenanceMode = "theouthaven_managed" | "owner_maintained";
export type LocationOperationalStatus =
  | "active"
  | "temporarily_closed"
  | "permanently_closed"
  | "moved"
  | "renamed"
  | "reopened"
  | "replaced"
  | "unknown";

export type LocationEvidenceType =
  | "identity"
  | "classification"
  | "geography"
  | "hours"
  | "review"
  | "feature"
  | "occasion"
  | "website"
  | "contact"
  | "status"
  | "owner"
  | "behavior";

export type LocationEvidence = {
  locationId: TohLocationId;
  provider: string;
  providerEntityId?: string | null;
  evidenceType: LocationEvidenceType;
  field: string;
  value: unknown;
  confidence?: number | null;
  observedAt: string;
  sourceUrl?: string | null;
  snapshotId?: string | null;
  metadata?: Record<string, unknown>;
};

export type ProviderCapability =
  | "identity"
  | "discovery"
  | "business_profile"
  | "reviews"
  | "geocoding"
  | "routing"
  | "website_discovery"
  | "web_context"
  | "status_verification"
  | "owner_profile"
  | "behavior_signals"
  | "ai_extraction"
  | "public_geography";

export type LocationProviderRequest = {
  capability: ProviderCapability;
  input: Record<string, unknown>;
};

export type LocationProviderResponse = {
  providerId: string;
  capability: ProviderCapability;
  data: unknown;
  evidence?: Omit<LocationEvidence, "locationId">[];
  metadata?: Record<string, unknown>;
};

export interface LocationIntelligenceProviderAdapter {
  readonly descriptor: ProviderDescriptor;
  supports(capability: ProviderCapability): boolean;
  execute(request: LocationProviderRequest): Promise<LocationProviderResponse>;
}

export type ProviderDescriptor = {
  id: string;
  enabled: boolean;
  capabilities: ProviderCapability[];
  credentialRef: string | null;
  priority: number;
  paid: boolean;
  maintenanceClass: "external_paid" | "external_free" | "first_party" | "internal";
};

export type LocationIntelligenceProfileV2 = {
  locationId: TohLocationId;
  profileVersion: number;
  maintenanceMode: LocationMaintenanceMode;
  operationalStatus: LocationOperationalStatus;
  qualityScore: number;
  searchV3Ready: boolean;
  identity: Record<string, unknown>;
  classification: Record<string, unknown>;
  geography: Record<string, unknown>;
  features: Record<string, unknown>;
  occasions: Record<string, unknown>;
  reviews: Record<string, unknown>;
  provenance: Record<string, unknown>;
  updatedAt: string;
};

export const LOCATION_INTELLIGENCE_V2_PROFILE_VERSION = 1;
