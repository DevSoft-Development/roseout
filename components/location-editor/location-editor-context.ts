import type { LocationType } from "@/lib/location-editor-links";

export type LocationEditorContext = {
  type: LocationType;
  routeLocationId: string;
  locationId: string;
  canonicalId?: string;
  canonicalLocationId?: string;
  adminLocationId?: string | null;
  effectiveLocationId: string;
  publicId: string;
  sourceId?: string | null;
  isDemoMode: boolean;
  isAdminContext: boolean;
  fromDemoCenter: boolean;
};

export function buildLocationEditorContext(input: {
  type: LocationType; locationId: string; canonicalId?: string | null; sourceId?: string | null; effectiveId?: string | null; adminLocationId?: string | null; isDemoMode?: boolean; isAdminContext?: boolean; fromDemoCenter?: boolean;
}): LocationEditorContext {
  const canonicalLocationId = input.canonicalId || input.effectiveId || input.adminLocationId || null;
  const effectiveLocationId = String(canonicalLocationId || input.sourceId || input.locationId);
  const publicId = String(input.sourceId || input.effectiveId || input.canonicalId || input.locationId);
  return { type: input.type, routeLocationId: input.locationId, locationId: input.locationId, canonicalId: input.canonicalId || undefined, canonicalLocationId: canonicalLocationId || undefined, adminLocationId: input.adminLocationId || null, effectiveLocationId, publicId, sourceId: input.sourceId || null, isDemoMode: Boolean(input.isDemoMode), isAdminContext: Boolean(input.isAdminContext || input.adminLocationId), fromDemoCenter: Boolean(input.fromDemoCenter) };
}

export function toSelectedLocationRequestContext(context: LocationEditorContext) {
  const canonical = context.canonicalLocationId || context.canonicalId || context.effectiveLocationId;
  const admin = context.adminLocationId || ((context.isAdminContext || context.isDemoMode) ? canonical : undefined);
  return {
    locationId: context.effectiveLocationId,
    location_id: context.effectiveLocationId,
    canonicalId: canonical,
    canonicalLocationId: canonical,
    canonical_location_id: canonical,
    adminLocationId: admin,
    admin_location_id: admin,
    sourceId: context.sourceId || undefined,
    source_id: context.sourceId || undefined,
    type: context.type,
    demo: context.isDemoMode ? "1" : undefined,
    fromDemoCenter: context.fromDemoCenter ? "1" : undefined,
    adminLocationMode: context.isAdminContext ? "1" : undefined,
  };
}
