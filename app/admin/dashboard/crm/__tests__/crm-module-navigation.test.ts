import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("CRM module navigation and location routing", () => {
  it("uses a single CRM module bar instead of a secondary sidebar", () => {
    const source = readFileSync("components/admin/crm/EnterpriseCrmShell.tsx", "utf8");

    expect(source).toContain('data-testid="crm-single-navigation-shell"');
    expect(source).toContain('aria-label="Primary CRM modules"');
    expect(source).toContain("All CRM");
    expect(source).not.toContain('data-testid="crm-secondary-sidebar"');
    expect(source).not.toContain("Collapse CRM sidebar");
  });

  it("keeps Locations on the location-backed CRM page instead of redirecting to Accounts", () => {
    const source = readFileSync("app/admin/dashboard/crm/locations/page.tsx", "utf8");

    expect(source).toContain('export { default, dynamic } from "../page"');
    expect(source).not.toContain("/admin/dashboard/crm/accounts");
  });

  it("keeps the highest-use data-backed modules in the primary CRM module bar", () => {
    const source = readFileSync("components/admin/crm/EnterpriseCrmShell.tsx", "utf8");

    for (const label of ["Home", "My Work", "Accounts", "Locations", "Claims", "Opportunities", "Outreach", "Support", "Operations", "Reports"]) {
      expect(source).toContain(`label: "${label}"`);
    }
  });
});
