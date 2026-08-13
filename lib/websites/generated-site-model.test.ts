import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("generated website data ownership", () => {
  it("keeps the AI website builder on business_websites", () => {
    const dataLayer = source("lib/websites/data.ts");
    const websiteRoute = source("app/api/business/website/route.ts");
    const directionRoute = source("app/api/business/website/design-direction/route.ts");

    for (const file of [dataLayer, websiteRoute, directionRoute]) {
      expect(file).toContain("business_websites");
      expect(file).not.toContain("location_websites");
    }
  });

  it("tracks generated-site AI usage separately from external websites", () => {
    const directionRoute = source("app/api/business/website/design-direction/route.ts");
    expect(directionRoute).toContain("business_website_ai_usage");
    expect(directionRoute).not.toContain("location_website_ai_usage");
  });

  it("allows hosting allocation before a domain is selected", () => {
    const allocator = source("lib/hosting/lightsail-nodes.ts");
    expect(allocator).toContain("rawDomain?: string | null");
    expect(allocator).toContain("domain: string | null");
  });
});
