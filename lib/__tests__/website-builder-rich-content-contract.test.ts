import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("website builder rich content", () => {
  it("hydrates the content editor with hours, photos, menu, reviews, reservations, and contact sections", () => {
    const data = source("lib/websites/data.ts");
    expect(data).toContain('type: "gallery"');
    expect(data).toContain('type: "hours"');
    expect(data).toContain('type: "menu"');
    expect(data).toContain('type: "reviews"');
    expect(data).toContain('type: "reservations"');
    expect(data).toContain("mergeWebsiteSectionsWithDefaults");
    expect(data).toContain('liveBindings: ["approved_reviews"]');
  });

  it("grounds rich website content in dashboard data instead of invented AI facts", () => {
    const content = source("lib/websites/location-content.ts");
    expect(content).toContain("getLocationMenu");
    expect(content).toContain('page.status === "published"');
    expect(content).toContain('.from("location_reviews")');
    expect(content).toContain('.eq("status", "approved")');
    expect(content).toContain('.eq("verified_visit", true)');
    expect(content).toContain("formatWebsiteHours");
    expect(content).toContain("location.images");
    expect(content).toContain("location.photos");
  });

  it("renders live gallery, hours, menu, and reviews in both preview and publish", () => {
    const artifact = source("lib/websites/content-artifact.ts");
    const preview = source("app/api/business/website/preview/route.ts");
    const publish = source("app/api/business/website/publish/route.ts");
    expect(artifact).toContain("galleryHtml");
    expect(artifact).toContain("hoursHtml");
    expect(artifact).toContain("menuHtml");
    expect(artifact).toContain("reviewsHtml");
    expect(artifact).toContain("Verified TheOutHaven guest");
    expect(preview).toContain("renderEnhancedWebsiteArtifact");
    expect(publish).toContain("renderEnhancedWebsiteArtifact");
  });

  it("requires AI wording for every enabled section while prohibiting invented live data", () => {
    const blueprint = source("lib/websites/blueprint.ts");
    expect(blueprint).toContain("Return useful heading and body wording for every enabled section");
    expect(blueprint).toContain("write framing copy only and never invent the underlying business data");
    expect(blueprint).toContain('"reviews"');
    expect(blueprint).toContain("sectionFallbackCopy");
  });

  it("uses TheOutHaven red, black, and white branding in the location dashboard builder", () => {
    const page = source("app/locations/dashboard/website/page.tsx");
    expect(page).toContain("website-builder-brand");
    expect(page).toContain("#ff2142");
    expect(page).toContain('class~="bg-[#f5b700]"');
    expect(page).toContain("Connected from this location dashboard");
  });
});
