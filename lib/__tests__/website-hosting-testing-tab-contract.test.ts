import fs from "node:fs";
import path from "node:path";

describe("website hosting testing tab", () => {
  const root = process.cwd();
  const overviewPath = path.join(root, "app/admin/dashboard/website-hosting/page.tsx");
  const testingPath = path.join(root, "app/admin/dashboard/website-hosting/testing/page.tsx");
  const tabsPath = path.join(root, "components/admin/WebsiteHostingTabs.tsx");

  const overview = fs.readFileSync(overviewPath, "utf8");
  const testing = fs.readFileSync(testingPath, "utf8");
  const tabs = fs.readFileSync(tabsPath, "utf8");

  it("keeps the hosting overview focused on operations", () => {
    expect(overview).toContain('<WebsiteHostingTabs active="overview" />');
    expect(overview).not.toContain("HostingDrTestPanel");
  });

  it("moves DR simulation and live drill controls to testing", () => {
    expect(testing).toContain('<WebsiteHostingTabs active="testing" />');
    expect(testing).toContain("<HostingDrTestPanel />");
    expect(testing).toContain("requireAdminRole(ADMIN_PAGE_ACCESS.dashboard)");
  });

  it("exposes Overview and Testing as sibling tabs", () => {
    expect(tabs).toContain('href: "/admin/dashboard/website-hosting"');
    expect(tabs).toContain('href: "/admin/dashboard/website-hosting/testing"');
    expect(tabs).toContain('label: "Overview"');
    expect(tabs).toContain('label: "Testing"');
  });
});
