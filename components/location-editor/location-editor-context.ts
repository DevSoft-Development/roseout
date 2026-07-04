import type { LocationType } from "@/lib/location-editor-links";

export type LocationEditorContext = {
  type: LocationType;
  locationId: string;
  canonicalId?: string;
  adminLocationId?: string | null;
  effectiveLocationId: string;
  publicId: string;
  sourceId?: string | null;
  isDemoMode: boolean;
  isAdminContext: boolean;
  fromDemoCenter: boolean;
};

export function buildLocationEditorContext(input: {
  type: LocationType;
  locationId: string;
  canonicalId?: string | null;
  sourceId?: string | null;
  effectiveId?: string | null;
  adminLocationId?: string | null;
  isDemoMode?: boolean;
  isAdminContext?: boolean;
  fromDemoCenter?: boolean;
}): LocationEditorContext {
  const effectiveLocationId = String(input.canonicalId || input.effectiveId || input.adminLocationId || input.sourceId || input.locationId);
  const publicId = String(input.sourceId || input.effectiveId || input.canonicalId || input.locationId);
  return {
    type: input.type,
    locationId: input.locationId,
    canonicalId: input.canonicalId || undefined,
    adminLocationId: input.adminLocationId || null,
    effectiveLocationId,
    publicId,
    sourceId: input.sourceId || null,
    isDemoMode: Boolean(input.isDemoMode),
    isAdminContext: Boolean(input.isAdminContext || input.adminLocationId),
    fromDemoCenter: Boolean(input.fromDemoCenter),
  };
}
