import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("admin CRM menu panel", () => {
  it("uses the CRM location ID for menu editing", () => {
    const source = readFileSync("app/admin/dashboard/crm/[id]/page.tsx", "utf8");
    expect(source).toContain('contextKey="adminLocationId"');
    expect(source).toContain('getBusinessMenuEditorHref(String(business.id), "admin")');
  });
});
