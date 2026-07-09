import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const redirectCases = [
  ["app/admin/dashboard/business-crm/page.tsx", "ROUTES.adminCrm"],
  ["app/admin/dashboard/business-crm/[id]/page.tsx", "ROUTES.adminCrmLocation(id)"],
  ["app/admin/dashboard/my-workspace/crm/page.tsx", "ROUTES.adminCrm"],
  ["app/admin/dashboard/my-workspace/crm/[locationId]/page.tsx", "ROUTES.adminCrmLocation(locationId)"],
  ["app/my-workspace/crm/page.tsx", "ROUTES.adminCrm"],
  ["app/my-workspace/crm/[locationId]/page.tsx", "ROUTES.adminCrmLocation(locationId)"],
  ["app/reserve/portal/page.tsx", "ROUTES.reserveDashboard"],
  ["app/reserve/portal/reservations/page.tsx", "ROUTES.reserveDashboardReservations"],
  ["app/dashboard/reservations/page.tsx", "ROUTES.adminReservations"],
  ["app/business/dashboard/reservations/page.tsx", "ROUTES.reserveDashboardReservations"],
  ["app/admin/claims/page.tsx", "ROUTES.adminClaims"],
  ["app/business/dashboard/notifications/page.tsx", "ROUTES.businessNotificationSettings"],
] as const;

describe("legacy route redirects", () => {
  it.each(redirectCases)("%s redirects through the route registry", (file, expected) => {
    const source = readFileSync(file, "utf8");
    expect(source).toContain("redirect(");
    expect(source).toContain(expected);
  });
});
