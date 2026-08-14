import fs from "node:fs";
import path from "node:path";
import { normalizeCustomWebsiteDomain } from "@/lib/websites/platform-domain";

describe("website domain creation flow", () => {
  it("normalizes valid custom domains and rejects TheOutHaven platform hosts", () => {
    expect(normalizeCustomWebsiteDomain("https://www.ExampleRestaurant.com/menu")).toBe("examplerestaurant.com");
    expect(normalizeCustomWebsiteDomain("theouthaven.com")).toBeNull();
    expect(normalizeCustomWebsiteDomain("venue.theouthaven.com")).toBeNull();
    expect(normalizeCustomWebsiteDomain("not-a-domain")).toBeNull();
  });

  it("keeps domain selection inside the website creation page", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "app/locations/dashboard/website/page.tsx"), "utf8");
    expect(source).toContain("WebsiteDomainSelector");
    expect(source).toContain("WebsiteBuilderWorkspace");
  });

  it("supports platform subdomain, owned domain, and new-domain registration", () => {
    const selector = fs.readFileSync(path.join(process.cwd(), "components/websites/WebsiteDomainSelector.tsx"), "utf8");
    const route = fs.readFileSync(path.join(process.cwd(), "app/api/business/website/route.ts"), "utf8");
    const registration = fs.readFileSync(path.join(process.cwd(), "components/growth-pro/PartnerProDomainSearch.tsx"), "utf8");

    expect(selector).toContain("Use a TheOutHaven subdomain");
    expect(selector).toContain("Use a domain I already own");
    expect(selector).toContain("Create a new domain");
    expect(selector).toContain("First year free");
    expect(selector).toContain("PartnerProDomainSearch");
    expect(registration).toContain("Renewal after the first year is not included");
    expect(route).toContain('body.domain_mode === "subdomain"');
    expect(route).toContain('body.domain_mode === "custom"');
    expect(route).toContain("normalizeCustomWebsiteDomain");
  });
});
