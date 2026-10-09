import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("enterprise Admin page migration", () => {
  it("routes CRM through the shared enterprise migration shell", () => {
    const crmShell = readFileSync(
      "apps/admin/components/admin/crm/CrmWorkspaceShell.tsx",
      "utf8",
    );
    expect(crmShell).toContain("admin-crm-enterprise");
  });

  it("migrates high-risk legacy surfaces to semantic enterprise classes", () => {
    for (const path of [
      "apps/admin/app/admin/dashboard/fraud/page.tsx",
      "apps/admin/app/admin/dashboard/experiences/page.tsx",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).toMatch(/admin-ui-(card|subcard)/);
    }
  });

  it("keeps CRM controls and tables on semantic design tokens", () => {
    const css = readFileSync(
      "apps/admin/app/admin/dashboard/admin-enterprise-foundation.css",
      "utf8",
    );
    expect(css).toContain(".admin-crm-enterprise form");
    expect(css).toContain("var(--toh-surface-card)");
    expect(css).toContain("var(--toh-border)");
  });
});
