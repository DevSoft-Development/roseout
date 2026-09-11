import fs from "node:fs";
import path from "node:path";
import { WEBSITE_DESIGN_DIRECTIONS, normalizeWebsiteDesignDirectionId } from "@/lib/websites/design-directions";
import { WEBSITE_COMPOSITION_PROFILES } from "@/lib/websites/composition-profiles";
import { WEBSITE_IMPORT_ADAPTERS, detectWebsiteImportAdapter } from "@/lib/websites/import-provider-adapters";

describe("premium website production contracts", () => {
  it("keeps the expanded premium design catalog composition-backed", () => {
    expect(WEBSITE_DESIGN_DIRECTIONS.length).toBeGreaterThanOrEqual(18);
    expect(WEBSITE_DESIGN_DIRECTIONS.reduce((sum, direction) => sum + direction.variants.length, 0)).toBeGreaterThanOrEqual(60);
    for (const direction of WEBSITE_DESIGN_DIRECTIONS) {
      expect(WEBSITE_COMPOSITION_PROFILES).toHaveProperty(direction.id);
      expect(direction.variants).toContain(direction.defaultVariant);
    }
  });

  it("does not silently change legacy published direction aliases", () => {
    expect(normalizeWebsiteDesignDirectionId("family_fun")).toBe("creative_workshop");
    expect(normalizeWebsiteDesignDirectionId("wellness_escape")).toBe("luxury_minimal");
    expect(normalizeWebsiteDesignDirectionId("competitive_social")).toBe("experiential_escape");
  });

  it("recognizes major existing-site platforms with dedicated adapters", () => {
    expect(WEBSITE_IMPORT_ADAPTERS.map(adapter => adapter.id)).toEqual(expect.arrayContaining([
      "wordpress", "wix", "squarespace", "toast", "bentobox", "popmenu", "webflow", "shopify", "square_weebly", "duda", "godaddy", "hostinger", "generic",
    ]));
    expect(detectWebsiteImportAdapter('<link href="/wp-content/theme.css">', "example.com").id).toBe("wordpress");
    expect(detectWebsiteImportAdapter('<script src="https://static.wixstatic.com/a.js"></script>', "example.com").id).toBe("wix");
    expect(detectWebsiteImportAdapter('<div class="sqs-block">Squarespace</div>', "example.com").id).toBe("squarespace");
    expect(detectWebsiteImportAdapter('<a href="https://www.toasttab.com/reserve">Reserve</a>', "example.com").id).toBe("toast");
  });

  it("keeps import, multi-page, health, rollback, and reservation routing on existing website infrastructure", () => {
    const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
    expect(read("app/api/business/website/import/route.ts")).toContain('from("business_websites")');
    expect(read("app/api/business/website/import/route.ts")).toContain('from("locations")');
    expect(read("lib/websites/content-artifact.ts")).toContain("addMultiPageArtifacts");
    expect(read("lib/websites/content-artifact.ts")).toContain("routeGeneratedReservationArtifact");
    expect(read("app/api/business/website/health/route.ts")).toContain("getGeneratedWebsiteLocationSnapshot");
    expect(read("app/api/business/website/rollback/route.ts")).toContain("business_website_versions");
    expect(read("app/api/business/website/rollback/route.ts")).toContain("deployWebsiteArtifact");
  });
});
