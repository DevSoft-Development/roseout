import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { API_ROUTES } from "@/lib/routes";

describe("reserve API contract", () => {
  it("centralizes QR generation routes through the shared service", () => {
    expect(readFileSync("app/api/reserve/portal/qr/generate/route.ts", "utf8")).toContain("ensureReserveLocationQrFields");
    expect(readFileSync("app/api/reserve/portal/qr/regenerate/route.ts", "utf8")).toContain("ensureReserveLocationQrFields");
    expect(readFileSync("lib/reserve/qr-service.ts", "utf8")).toContain('behavior: mode === "regenerate" ? "ensure-current" : "ensure-current"');
  });

  it("uses canonical reserve portal APIs in dashboard command-center UI", () => {
    const source = readFileSync("components/reserve/ReserveCommandCenterPage.tsx", "utf8");
    expect(source).toContain("/api/reserve/portal/reservations");
    expect(source).not.toContain("/api/debug");
  });

  it("keeps waitlist behind the reserve portal API with a compatibility wrapper", () => {
    expect(API_ROUTES.reservePortalWaitlist).toBe("/api/reserve/portal/waitlist");
    expect(readFileSync("app/api/reserve/portal/waitlist/route.ts", "utf8")).toContain("handleReserveWaitlistGET");
    expect(readFileSync("app/api/reserve/portal/waitlist/route.ts", "utf8")).toContain("handleReserveWaitlistPOST");
    expect(readFileSync("app/api/reservations/waitlist/route.ts", "utf8")).toContain("Compatibility wrapper");
    expect(readFileSync("app/api/reservations/waitlist/route.ts", "utf8")).toContain("handleReserveWaitlistGET");
  });
});
