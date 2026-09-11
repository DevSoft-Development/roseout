import fs from "node:fs";
import path from "node:path";
import { WEBSITE_DESIGN_DIRECTIONS, normalizeWebsiteDesignDirectionId } from "@/lib/websites/design-directions";
import { WEBSITE_COMPOSITION_PROFILES } from "@/lib/websites/composition-profiles";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("hosted website platform completion", () => {
  it("ships forty unique premium design families with composition profiles", () => {
    expect(WEBSITE_DESIGN_DIRECTIONS).toHaveLength(40);
    const ids = WEBSITE_DESIGN_DIRECTIONS.map((direction) => direction.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain("competitive_social");
    expect(normalizeWebsiteDesignDirectionId("competitive_social")).toBe("experiential_escape");
    for (const direction of WEBSITE_DESIGN_DIRECTIONS) {
      expect(WEBSITE_COMPOSITION_PROFILES[direction.id]).toBeDefined();
      expect(direction.variants).toContain(direction.defaultVariant);
    }
  });

  it("gives the expanded families their own visual token layer", () => {
    const themes = read("lib/websites/expanded-design-theme-artifact.ts");
    for (const id of ["social_games", "modern_steakhouse", "rooftop_city", "jazz_room", "arcade_neon", "spa_serene", "private_events"]) {
      expect(themes).toContain(`.composition-${id}`);
    }
    expect(read("lib/websites/content-artifact.ts")).toContain("expandedWebsiteDesignStyles");
  });

  it("requires migration review before publishing imported websites", () => {
    const importer = read("app/api/business/website/import/route.ts");
    const review = read("app/api/business/website/migration-review/route.ts");
    const publish = read("app/api/business/website/publish/route.ts");
    expect(importer).toContain('review_status: "pending"');
    expect(review).toContain('"approved", "needs_changes"');
    expect(publish).toContain("migration_review_required");
    expect(read("components/websites/WebsiteMigrationReviewPanel.tsx")).toContain("Approve migration");
  });

  it("deploys migration redirects as validated permanent redirects and restores them on rollback", () => {
    const contract = read("lib/websites/publish-contract.ts");
    const deployAgent = read("ops/website-deploy-agent.mjs");
    const publish = read("app/api/business/website/publish/route.ts");
    const rollback = read("app/api/business/website/rollback/route.ts");
    expect(contract).toContain("WebsiteDeployRedirect");
    expect(contract).toContain("input.length > 30");
    expect(deployAgent).toContain("normalizeRedirects(payload.redirects)");
    expect(deployAgent).toContain(" 301");
    expect(publish).toContain("getMigrationRedirectRules");
    expect(rollback).toContain("getMigrationRedirectRules");
  });

  it("keeps navigation conditional on pages actually emitted", () => {
    const pages = read("lib/websites/multi-page-artifact.ts");
    expect(pages).toContain('path: "about/index.html"');
    expect(pages).toContain('path: "reviews/index.html"');
    expect(pages).toContain('path: "contact/index.html"');
    expect(pages).toContain("const emitted = PAGE_RULES");
    expect(pages).toContain("navHtml(navPages)");
  });

  it("supports subdomain, owned domain, and included first-year OpenSRS registration end to end", () => {
    const selector = read("components/websites/WebsiteDomainSelector.tsx");
    const eligibility = read("app/api/business/domains/eligibility/route.ts");
    const provision = read("app/api/business/domains/provision/route.ts");
    const gateway = read("lib/domains/gateway.ts");
    const lifecycle = read("app/api/cron/domain-lifecycle/route.ts");
    const readiness = read("app/api/business/website/cutover-readiness/route.ts");
    expect(selector).toContain("Use a TheOutHaven subdomain");
    expect(selector).toContain("OpenSRS registrar connection");
    expect(selector).toContain("First year included");
    expect(eligibility).toContain("included_with_essentials");
    expect(provision).toContain('registrar: "opensrs"');
    expect(provision).toContain("connectGeneratedSiteDomain");
    expect(gateway).toContain("/v1/domains/register");
    expect(gateway).toContain("/v1/domains/dns/configure");
    expect(lifecycle).toContain("provisioning_ssl");
    expect(readiness).toContain('domainMode = customDomain ? "custom" : "subdomain"');
  });

  it("surfaces migration state in the existing admin website-hosting control plane", () => {
    const tabs = read("components/admin/WebsiteHostingTabs.tsx");
    const migrations = read("app/admin/dashboard/website-hosting/migrations/page.tsx");
    expect(tabs).toContain('label: "Migrations"');
    expect(migrations).toContain("Needs review");
    expect(migrations).toContain("Domain pending");
    expect(migrations).toContain("Ready to publish");
    expect(migrations).toContain("WebsiteHostingTabs active=\"migrations\"");
  });

  it("keeps provider-specific import inventory on the existing import record", () => {
    const inventory = read("lib/websites/import-content-inventory.ts");
    const importer = read("app/api/business/website/import/route.ts");
    expect(inventory).toContain('adapterId === "wordpress"');
    expect(inventory).toContain('adapterId === "toast"');
    expect(inventory).toContain('adapterId === "bentobox"');
    expect(inventory).toContain('adapterId === "popmenu"');
    expect(importer).toContain("content_inventory: contentInventory");
    expect(importer).toContain('from("business_websites")');
  });
});
