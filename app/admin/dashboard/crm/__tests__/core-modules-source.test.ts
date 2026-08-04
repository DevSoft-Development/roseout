import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("CRM core module implementation contract", () => {
  it("keeps canonical claims, support, operations, and reports routes data-backed", () => {
    for (const path of [
      "app/admin/dashboard/crm/claims/page.tsx",
      "app/admin/dashboard/crm/support/page.tsx",
      "app/admin/dashboard/crm/operations/page.tsx",
      "app/admin/dashboard/crm/reports/page.tsx",
    ]) {
      const source = read(path);
      expect(source).not.toContain("CrmViewCard");
      expect(source).not.toContain("redirect(");
      expect(source).toMatch(/listClaims|listSupport|operationsSnapshot|reportSnapshot/);
    }
  });

  it("uses selectors instead of raw UUID account input for opportunity creation", () => {
    const source = read("app/admin/dashboard/crm/opportunities/page.tsx");
    expect(source).toContain("listOpportunitySelectors");
    expect(source).toContain("Select account");
    expect(source).not.toContain("placeholder=\"Account UUID\"");
  });

  it("provides a permission-gated CSV export with stable escaped columns", () => {
    const source = read("app/admin/dashboard/crm/reports/export/route.ts");
    expect(source).toContain("requireAdminRole");
    expect(source).toContain("text/csv");
    expect(source).toContain("metric");
    expect(source).toContain("replaceAll");
  });
});

describe("CRM module route coverage", () => {
  it("preserves outreach follow-up and site-visit route adapters", () => {
    expect(read("app/admin/dashboard/crm/follow-ups/page.tsx")).toContain("../outreach/page");
    expect(read("app/admin/dashboard/crm/site-visits/page.tsx")).toContain("../outreach/page");
  });
});
