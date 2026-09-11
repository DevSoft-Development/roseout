import fs from "node:fs";
import path from "node:path";
import { WEBSITE_DESIGN_DIRECTIONS } from "@/lib/websites/design-directions";
import { WEBSITE_COMPOSITION_PROFILES } from "@/lib/websites/composition-profiles";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

function profileSignature(id: string) {
  const profile = WEBSITE_COMPOSITION_PROFILES[id];
  if (!profile) return "missing";
  return [profile.nav, profile.hero, profile.sectionOrder.join(">"), profile.reservationPlacement, profile.radius, profile.maxWidth, profile.displayScale, profile.eyebrowTracking, profile.imageRatio, profile.sectionRule].join("|");
}

describe("website production verification end to end", () => {
  it("keeps all three website address paths connected to production verification", () => {
    const selector = read("components/websites/WebsiteDomainSelector.tsx");
    const eligibility = read("app/api/business/domains/eligibility/route.ts");
    const provision = read("app/api/business/domains/provision/route.ts");
    const lifecycle = read("app/api/cron/domain-lifecycle/route.ts");
    const verification = read("lib/websites/production-verification.ts");

    expect(selector).toContain("Use a TheOutHaven subdomain");
    expect(selector).toContain("Use a domain I already own");
    expect(selector).toContain("Register a new domain");
    expect(eligibility).toContain("included_with_essentials");
    expect(provision).toContain("domain_registered_and_connected");
    expect(provision).toContain('registrar: "opensrs"');
    expect(lifecycle).toContain("provisioning_ssl");
    expect(lifecycle).toContain("included_domain_renewal_due_at");
    expect(verification).toContain("opensrs_registration");
    expect(verification).toContain("opensrs_connection");
    expect(verification).toContain("opensrs_renewal");
  });

  it("makes migration issues resolvable without bypassing blocking failures", () => {
    const resolve = read("app/api/business/website/migration-review/resolve/route.ts");
    const review = read("app/api/business/website/migration-review/route.ts");
    const panel = read("components/websites/WebsiteMigrationReviewPanel.tsx");

    expect(resolve).toContain("provider_confirmed");
    expect(resolve).toContain("redirect_confirmed");
    expect(resolve).toContain("keep_pdf");
    expect(resolve).toContain("form_reviewed");
    expect(resolve).toContain('target.severity === "blocking"');
    expect(review).toContain("unresolvedExceptions");
    expect(panel).toContain("Confirm provider");
    expect(panel).toContain("Save redirect");
    expect(panel).toContain("Approve website move");
  });

  it("keeps the owner website workflow free of infrastructure jargon", () => {
    const builder = read("components/websites/WebsiteBuilderWorkspace.tsx");
    expect(builder).toContain("Website Designer");
    expect(builder).toContain('style: "Design"');
    expect(builder).toContain("Starting point");
    expect(builder).toContain('type Device = "desktop" | "tablet" | "mobile"');
    expect(builder).not.toContain("AI Website Generation V3");
    expect(builder).not.toContain("deterministic production renderer");
    expect(builder).not.toContain("Building your V3 blueprint");
    expect(builder).not.toContain("Last publish issue:");
  });

  it("maintains forty design families with broad structural diversity", () => {
    expect(WEBSITE_DESIGN_DIRECTIONS).toHaveLength(40);
    const signatures = WEBSITE_DESIGN_DIRECTIONS.map((direction) => profileSignature(direction.id));
    expect(signatures).not.toContain("missing");
    expect(new Set(signatures).size).toBeGreaterThanOrEqual(34);

    const heroes = new Set(WEBSITE_DESIGN_DIRECTIONS.map((direction) => WEBSITE_COMPOSITION_PROFILES[direction.id]?.hero));
    const navs = new Set(WEBSITE_DESIGN_DIRECTIONS.map((direction) => WEBSITE_COMPOSITION_PROFILES[direction.id]?.nav));
    const ratios = new Set(WEBSITE_DESIGN_DIRECTIONS.map((direction) => WEBSITE_COMPOSITION_PROFILES[direction.id]?.imageRatio));
    expect(heroes.size).toBeGreaterThanOrEqual(7);
    expect(navs.size).toBeGreaterThanOrEqual(3);
    expect(ratios.size).toBeGreaterThanOrEqual(5);
  });

  it("surfaces production verification in the existing website-hosting control plane", () => {
    const tabs = read("components/admin/WebsiteHostingTabs.tsx");
    const page = read("app/admin/dashboard/website-hosting/verification/page.tsx");
    const verification = read("lib/websites/production-verification.ts");

    expect(tabs).toContain('label: "Verification"');
    expect(page).toContain("Production Verification");
    expect(page).toContain("40-family design coverage");
    expect(verification).toContain("Latest standby replica");
    expect(verification).toContain("Custom-domain SSL");
    expect(verification).toContain("Recent live health check");
  });
});
