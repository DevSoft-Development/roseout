import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("Website V3 Nocturne renderer", () => {
  const renderer = source("lib/websites/v3/nocturne.ts");
  const catalog = source("lib/websites/v3/catalog.ts");
  const page = source("app/locations/dashboard/website/page.tsx");
  const selector = source("components/websites/WebsiteEngineSelector.tsx");

  it("is clean-room and does not depend on the legacy presentation stack", () => {
    expect(renderer).not.toContain("static-renderer");
    expect(renderer).not.toContain("premium-theme-artifact");
    expect(renderer).not.toContain("agency-template-system");
    expect(renderer).not.toContain("bespoke-premium-renderer");
    expect(renderer).not.toContain("composition-profiles");
  });

  it("owns a complete Nocturne composition", () => {
    expect(renderer).toContain("renderNocturneV3Preview");
    expect(renderer).toContain("class=\"hero\"");
    expect(renderer).toContain("class=\"story-grid\"");
    expect(renderer).toContain("class=\"menu-section\"");
    expect(renderer).toContain("class=\"reserve-band\"");
    expect(renderer).toContain("class=\"visit\"");
  });

  it("marks only Nocturne preview-ready and wires it into the dashboard", () => {
    expect(catalog).toContain('id: "nocturne"');
    expect(catalog).toMatch(/id: "nocturne"[\s\S]*?status: "preview_ready"/);
    expect(page).toContain("renderNocturneV3Preview");
    expect(page).toContain("WebsiteV3Preview");
    expect(page).toContain('v3ConceptId === "nocturne"');
    expect(selector).toContain("Preview ready");
    expect(selector).toContain("In development");
    expect(selector).not.toContain(">Building<");
  });
});
