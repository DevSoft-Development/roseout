import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const adminNavFiles = [
  "app/admin/components/AdminTopBar.tsx",
  "app/admin/dashboard/page.tsx",
  "app/admin/dashboard/crm/page.tsx",
  "components/growth-pro/GrowthProShell.tsx",
];

describe("dashboard navigation routes", () => {
  it("does not point production navigation at legacy claim or CRM routes", () => {
    for (const file of adminNavFiles) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain('"/admin/claims"');
      expect(source).not.toContain('"/admin/dashboard/business-crm"');
      expect(source).not.toContain('"/admin/dashboard/my-workspace/crm"');
      expect(source).not.toContain('"/api/debug');
    }
  });
});
