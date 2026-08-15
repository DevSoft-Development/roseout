import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("AI Website Generation V3", () => {
  it("uses a structured blueprint instead of arbitrary generated frontend code", () => {
    const blueprint = source("lib/websites/blueprint.ts");
    const route = source("app/api/business/website/generate/route.ts");

    expect(blueprint).toContain("WEBSITE_BLUEPRINT_VERSION = 3");
    expect(blueprint).toContain("WebsiteBlueprint");
    expect(blueprint).toContain("Do not output HTML, CSS, JavaScript");
    expect(blueprint).toContain("Allowed section types");
    expect(route).toContain("normalizeWebsiteBlueprint");
    expect(route).toContain("blueprintToWebsiteSections");
  });

  it("generates identity, composition, conversion, copy, SEO, and visual strategy", () => {
    const blueprint = source("lib/websites/blueprint.ts");

    for (const contract of [
      "businessIdentity",
      "visualHierarchy",
      "imageStrategy",
      "primaryCta",
      "secondaryCta",
      "sections",
      "heroHeading",
      "heroSubheading",
      "aboutBody",
      "seoTitle",
      "seoDescription",
    ]) {
      expect(blueprint).toContain(contract);
    }
  });

  it("keeps real imagery only and blocks AI image generation", () => {
    const blueprint = source("lib/websites/blueprint.ts");
    const route = source("app/api/business/website/generate/route.ts");
    const config = source("lib/websites/ai-config.ts");

    expect(config).toContain("WEBSITE_AI_IMAGE_GENERATION_ENABLED = false");
    expect(blueprint).toContain("Use real-location imagery only");
    expect(route).toContain("Website AI image generation must remain disabled");
  });

  it("uses existing initial-build and redesign quota guardrails", () => {
    const route = source("app/api/business/website/generate/route.ts");
    const guardrails = source("supabase/migrations/20260814121000_business_website_ai_guardrails.sql");

    expect(route).toContain('"initial_build"');
    expect(route).toContain('"full_redesign"');
    expect(route).toContain("begin_location_website_ai_generation");
    expect(route).toContain("finish_location_website_ai_generation");
    expect(guardrails).toContain("max_concurrent_generations");
    expect(guardrails).toContain("max_estimated_cost_micros_per_location_month");
  });

  it("bypasses customer redesign quotas only for the canonical mirror demo", () => {
    const route = source("app/api/business/website/generate/route.ts");
    const demo = source("lib/demo/demo-center.ts");

    expect(demo).toContain('MIRROR_DEMO_KEY = "real_location_mirror_demo"');
    expect(route).toContain("location.is_demo === true");
    expect(route).toContain('String(location.demo_key || "") === MIRROR_DEMO_KEY');
    expect(route).toContain("if (!unlimitedDemo)");
    expect(route).toContain("quota_bypassed: unlimitedDemo");
  });

  it("wires the V3 generator into the owner builder and existing preview/publish pipeline", () => {
    const builder = source("components/websites/WebsiteBuilderWorkspace.tsx");
    const preview = source("app/api/business/website/preview/route.ts");
    const publish = source("app/api/business/website/publish/route.ts");

    expect(builder).toContain("/api/business/website/generate");
    expect(builder).toContain("AI Website Generation V3");
    expect(builder).toContain("/api/business/website/preview");
    expect(builder).toContain("/api/business/website/publish");
    expect(preview).toContain("renderWebsiteArtifact");
    expect(publish).toContain("renderWebsiteArtifact");
    expect(publish).toContain("custom_content: website.custom_content");
  });
});
