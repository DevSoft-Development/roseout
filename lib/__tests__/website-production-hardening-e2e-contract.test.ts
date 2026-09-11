import fs from "node:fs";
import path from "node:path";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("hosted website production hardening", () => {
  it("keeps the LCP image eager and later images lazy", () => {
    const seo = read("lib/websites/seo-accessibility-artifact.ts");
    expect(seo).toContain('loading="eager" fetchpriority="high" decoding="async"');
    expect(seo).toContain('loading="lazy" decoding="async"');
  });

  it("uses business-aware page metadata and richer structured data", () => {
    const seo = read("lib/websites/seo-accessibility-artifact.ts");
    expect(seo).toContain('`${label} | ${name}`');
    expect(seo).toContain('"@type": "PostalAddress"');
    expect(seo).toContain('"@type": "Event"');
    expect(seo).toContain('"@type": "ReserveAction"');
    expect(seo).toContain('return "Restaurant"');
    expect(seo).toContain('return "EntertainmentBusiness"');
  });

  it("records migration exceptions and prevents blocking approval", () => {
    const exceptions = read("lib/websites/migration-exceptions.ts");
    const importer = read("app/api/business/website/import/route.ts");
    const review = read("app/api/business/website/migration-review/route.ts");
    expect(exceptions).toContain("forms_need_review");
    expect(exceptions).toContain("menu_pdf_only");
    expect(exceptions).toContain("reservation_provider_unknown");
    expect(exceptions).toContain("canonical_host_mismatch");
    expect(exceptions).toContain("external_assets");
    expect(importer).toContain("blocking_exception_count");
    expect(review).toContain("migration_blockers_unresolved");
  });

  it("runs live site, booking, sitemap, and robots checks on the existing failover schedule", () => {
    const failover = read("app/api/cron/website-failover/route.ts");
    expect(failover).toContain("checkHostedWebsiteLiveHealth");
    expect(failover).toContain("reservation_link_unreachable");
    expect(failover).toContain("website_unreachable");
    expect(failover).toContain("website_seo_endpoint_unhealthy");
    expect(failover).toContain("last_health_check_at");
  });

  it("keeps the owner website workflow business-first", () => {
    const page = read("app/locations/dashboard/website/page.tsx");
    expect(page).toContain("Your website stays current automatically");
    expect(page).toContain("Edit business facts once in Edit Location");
    expect(page.indexOf("<WebsiteBuilderWorkspace")).toBeLessThan(page.indexOf("<WebsiteCutoverReadinessPanel"));
  });
});
