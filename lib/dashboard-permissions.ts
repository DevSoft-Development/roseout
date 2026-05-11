import "server-only";

export const ADMIN_DASHBOARD_ROLES = new Set(["superuser", "admin"]);

export const LOCATION_OWNER_ROLES = new Set([
  "location_owner",
  "location-owner",
  "locations",
  "location",
  "restaurants",
  "restaurant",
  "activity_owner",
  "activity-owner",
  "owner",
]);

export function normalizeRole(role: unknown) {
  return typeof role === "string" ? role.trim().toLowerCase() : "";
}

export function roleSetHas(roles: Iterable<unknown>, allowedRoles: Set<string>) {
  return Array.from(roles).some((role) => allowedRoles.has(normalizeRole(role)));
}
