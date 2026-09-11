import fs from "node:fs";
import path from "node:path";

describe("premium hosted website rollout phases 2-6", () => {
  const read = (file:string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

  it("keeps website-ready business facts in the existing Edit Location area", () => {
    const page = read("app/locations/dashboard/profile/page.tsx");
    const panel = read("app/locations/dashboard/profile/WebsiteReadyLocationPanel.tsx");
    expect(page).toContain("WebsiteReadyLocationPanel");
    expect(panel).toContain("Edit once. Your website updates from here.");
    expect(panel).toContain("dress_code");
    expect(panel).toContain("parking_info");
    expect(panel).toContain("special_features");
    expect(panel).toContain("reservation_provider");
  });

  it("binds those facts into the existing generated website location snapshot", () => {
    const source = read("lib/websites/location-content.ts");
    expect(source).toContain("dress_code");
    expect(source).toContain("parking_info");
    expect(source).toContain("best_for");
    expect(source).toContain("special_features");
  });

  it("adds multi-page output without replacing the current artifact renderer", () => {
    const pages = read("lib/websites/multi-page-artifact.ts");
    const artifact = read("lib/websites/content-artifact.ts");
    expect(pages).toContain('"menu/index.html"');
    expect(pages).toContain('"reservations/index.html"');
    expect(pages).toContain('"events/index.html"');
    expect(artifact).toContain("renderWebsiteArtifact");
    expect(artifact).toContain("addGeneratedWebsitePages");
  });

  it("supports preserve, modernize, and redesign modes inside the existing website flow", () => {
    const route = read("app/api/business/website/import/route.ts");
    const panel = read("components/websites/WebsiteImportPanel.tsx");
    for (const mode of ["preserve_exact", "modernize", "redesign"]) {
      expect(route).toContain(mode);
      expect(panel).toContain(mode);
    }
    expect(route).toContain("design_lock");
    expect(route).toContain("website_import");
  });

  it("protects website import from private-network fetches", () => {
    const route = read("app/api/business/website/import/route.ts");
    expect(route).toContain("lookup");
    expect(route).toContain("isPrivateIp");
    expect(route).toContain('redirect: "manual"');
  });

  it("extends existing rollback to Lightsail and preserves current version history", () => {
    const route = read("app/api/business/website/rollback/route.ts");
    expect(route).toContain('hostingMode !== "lightsail"');
    expect(route).toContain("deployWebsiteArtifact");
    expect(route).toContain('source: "rollback"');
    expect(route).toContain("replicateWebsiteToStandby");
  });

  it("surfaces website health and import in the existing website management page", () => {
    const page = read("app/locations/dashboard/website/page.tsx");
    expect(page).toContain("WebsiteHealthPanel");
    expect(page).toContain("WebsiteImportPanel");
    expect(page).toContain("Edit business information");
    expect(page).toContain("Auto-sync on");
  });
});
