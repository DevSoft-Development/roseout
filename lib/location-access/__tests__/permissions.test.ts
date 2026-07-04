import { describe, expect, it } from "vitest";
import { hasLocationPermission, permissionsForAccess } from "../permissions";
import type { LocationAccessContext } from "../types";

function context(permissions: LocationAccessContext["permissions"]): LocationAccessContext {
  return {
    userId: "user-1",
    locationId: "location-1",
    isAuthenticated: true,
    isSuperadmin: false,
    isAdmin: false,
    isDemoLocation: false,
    isDemoPreview: false,
    isOwner: false,
    isLocationAdmin: false,
    isViewOnly: false,
    canView: permissions.includes("location.view"),
    canEdit: permissions.includes("location.edit"),
    permissions,
    source: "owner",
  };
}

describe("location access permissions", () => {
  it("grants edit permissions to edit-capable users", () => {
    const permissions = permissionsForAccess(true);
    expect(permissions).toContain("menu.edit");
    expect(permissions).toContain("marketing.edit");
    expect(permissions).toContain("recommendations.apply");
    expect(permissions).toContain("photos.upload");
  });

  it("keeps view-only users from mutating private tools", () => {
    const permissions = permissionsForAccess(false);
    const ctx = context(permissions);
    expect(hasLocationPermission(ctx, "menu.view")).toBe(true);
    expect(hasLocationPermission(ctx, "marketing.view")).toBe(true);
    expect(hasLocationPermission(ctx, "menu.edit")).toBe(false);
    expect(hasLocationPermission(ctx, "photos.upload")).toBe(false);
  });
});
