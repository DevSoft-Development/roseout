import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { WEBSITE_V3_CONCEPTS } from "@/lib/websites/v3/catalog";

function source(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("Website V3 engine selector contract", () => {
  const page = source("app/locations/dashboard/website/page.tsx");
  const selector = source("components/websites/WebsiteEngineSelector.tsx");

  it("ships exactly the five clean-room launch concepts", () => {
    expect(WEBSITE_V3_CONCEPTS.map((concept) => concept.id)).toEqual([
      "nocturne",
      "atelier",
      "vista",
      "social_house",
      "quiet_luxury",
    ]);
  });

  it("persists renderer and concept per location in website theme", () => {
    expect(selector).toContain("renderer_version: nextRenderer");
    expect(selector).toContain("v3_concept: nextConcept");
    expect(selector).toContain('fetch("/api/business/website"');
  });

  it("keeps V3 isolated from the Legacy builder and publish controls", () => {
    expect(page).toContain('rendererVersion === "v3"');
    expect(page).toContain("V3 Premium workspace");
    expect(page).toContain("Publishing is intentionally unavailable in V3");
    expect(page).toContain("<WebsiteBuilderWorkspace");
    expect(page.indexOf('rendererVersion === "v3"')).toBeLessThan(page.indexOf("<WebsiteBuilderWorkspace"));
  });

  it("makes Legacy explicitly reversible", () => {
    expect(selector).toContain('save("legacy", concept)');
    expect(selector).toContain("Current — Legacy");
  });
});
