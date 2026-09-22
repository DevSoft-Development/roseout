import fs from "node:fs";
import path from "node:path";

describe("deep website migration and cutover contract", () => {
  const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

  it("keeps the migration crawler bounded and blocks private targets", () => {
    const source = read("lib/websites/import-crawler.ts");
    expect(source).toContain("const MAX_PAGES = 12");
    expect(source).toContain("const MAX_PAGE_BYTES = 1_000_000");
    expect(source).toContain("const MAX_TOTAL_BYTES = 6_000_000");
    expect(source).toContain("assertPublicWebsiteUrl");
    expect(source).toContain("private_website_host");
    expect(source).toContain('redirect: "manual"');
  });

  it("captures migration fidelity signals and prefers real external reservation providers", () => {
    const crawler = read("lib/websites/import-crawler.ts");
    const route = read("app/api/business/website/import/route.ts");
    const selector = read("lib/websites/reservation-link-selection.ts");
    expect(crawler).toContain("reservation_links");
    expect(crawler).toContain("social_links");
    expect(crawler).toContain("schema_types");
    expect(crawler).toContain("redirect_map");
    expect(route).toContain("migration_manifest");
    expect(route).toContain("form_count");
    expect(route).toContain("selectBestReservationLink");
    expect(selector).toContain('label: "Resy"');
    expect(selector).toContain('label: "OpenTable"');
    expect(selector).toContain("candidate.external || candidate.provider");
  });

  it("checks custom-domain cutover readiness without a second hosting path", () => {
    const route = read("app/api/business/website/cutover-readiness/route.ts");
    expect(route).toContain("Website version published");
    expect(route).toContain("DNS verified");
    expect(route).toContain("SSL active");
    expect(route).toContain("Apex domain responds");
    expect(route).toContain("www domain responds or redirects");
    expect(route).toContain("Sitemap available");
    expect(route).toContain("Migration redirect plan ready");
  });

  it("surfaces migration depth and cutover readiness in the existing website workspace", () => {
    const page = read("app/locations/dashboard/website/page.tsx");
    const importer = read("components/websites/WebsiteImportPanel.tsx");
    expect(page).toContain("WebsiteCutoverReadinessPanel");
    expect(importer).toContain("Pages scanned");
    expect(importer).toContain("Old URLs mapped");
    expect(importer).toContain("Nothing is published automatically");
  });
});
