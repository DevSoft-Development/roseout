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

  it("supports both platform subdomain and custom-domain persistence", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "app/api/business/website/route.ts"), "utf8");
    expect(source).toContain('body.domain_mode === "subdomain"');
    expect(source).toContain('body.domain_mode === "custom"');
    expect(source).toContain("normalizeCustomWebsiteDomain");
  });
});
