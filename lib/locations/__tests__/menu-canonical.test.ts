import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("canonical location menu flow", () => {
  it("keeps private menu API as a thin wrapper around the shared service", () => {
    const route = readFileSync("app/api/business/menu/route.ts", "utf8");
    expect(route).toContain("getEditableLocationMenu");
    expect(route).toContain("saveLocationMenu");
    expect(route).not.toContain("location_commerce_items");
  });

  it("uses the same service for business, CRM, public API, and public renderer", () => {
    expect(readFileSync("app/business/dashboard/menu/page.tsx", "utf8")).toContain("getEditableLocationMenu");
    expect(readFileSync("app/admin/dashboard/crm/[id]/page.tsx", "utf8")).toContain("getEditableLocationMenu");
    expect(readFileSync("app/api/public/menu/route.ts", "utf8")).toContain("getPublicLocationMenu");
    expect(readFileSync("app/locations/[type]/[locationId]/menu/page.tsx", "utf8")).toContain("getPublicLocationMenu");
  });

  it("documents one canonical commerce table source in the menu service", () => {
    const service = readFileSync("lib/locations/menu.ts", "utf8");
    expect(service).toContain("location_commerce_pages");
    expect(service).toContain("location_commerce_sections");
    expect(service).toContain("location_commerce_items");
    expect(service).toContain("assertCanEdit");
    expect(service).toContain("status",);
  });
});
