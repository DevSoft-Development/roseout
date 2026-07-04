import type { LocationAccessContext, LocationPermission } from "./types";

export const VIEW_PERMISSIONS: LocationPermission[] = [
  "location.view",
  "menu.view",
  "marketing.view",
  "recommendations.view",
  "photos.view",
];

export const EDIT_PERMISSIONS: LocationPermission[] = [
  "location.edit",
  "menu.edit",
  "marketing.edit",
  "recommendations.apply",
  "photos.upload",
];

export const ALL_LOCATION_PERMISSIONS: LocationPermission[] = [
  ...VIEW_PERMISSIONS,
  ...EDIT_PERMISSIONS,
];

export function hasLocationPermission(ctx: LocationAccessContext | null | undefined, permission: LocationPermission) {
  return Boolean(ctx?.permissions?.includes(permission));
}

export function permissionsForAccess(canEdit: boolean, extra: LocationPermission[] = []) {
  return Array.from(new Set([...(canEdit ? ALL_LOCATION_PERMISSIONS : VIEW_PERMISSIONS), ...extra]));
}
