import { describe, expect, it } from "vitest";
import { API_ROUTES, ROUTES } from "@/lib/routes";

describe("canonical route registry", () => {
  it("exposes canonical dashboard routes", () => {
    expect(ROUTES.adminCrm).toBe("/admin/dashboard/crm");
    expect(ROUTES.reserveDashboard).toBe("/reserve/dashboard");
    expect(ROUTES.reserveDashboardReservations).toBe("/reserve/dashboard/reservations");
    expect(ROUTES.adminClaims).toBe("/admin/dashboard/claims");
    expect(ROUTES.businessNotificationSettings).toBe("/business/dashboard/settings/notifications");
  });

  it("encodes dynamic route parameters", () => {
    expect(ROUTES.adminCrmLocation("abc/123")).toBe("/admin/dashboard/crm/abc%2F123");
    expect(ROUTES.reserveBooking("restaurant", "loc/1")).toBe("/reserve/location/loc%2F1?type=restaurant");
    expect(ROUTES.reserveBooking(undefined, "loc/1")).toBe("/reserve/location/loc%2F1");
    expect(ROUTES.reserveConfirmation("tok/1")).toBe("/reserve/confirmation/tok%2F1");
  });

  it("keeps canonical API helpers for duplicate API families", () => {
    expect(API_ROUTES.adminEmailTemplatePreview).toBe("/api/admin/email/templates/preview");
    expect(API_ROUTES.reservePortalQrGenerate).toBe("/api/reserve/portal/qr/generate");
    expect(API_ROUTES.reservePortalQrRegenerate).toBe("/api/reserve/portal/qr/regenerate");
    expect(API_ROUTES.reservePortalWaitlist).toBe("/api/reserve/portal/waitlist");
  });
});
