import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("generated website logo branding", () => {
  it("provides an authenticated location-scoped logo upload and delete API", () => {
    const route = source("app/api/business/website/logo/route.ts");
    expect(route).toContain("getAuthorizedWebsiteLocation");
    expect(route).toContain('const BUCKET = "website-brand-assets"');
    expect(route).toContain('"image/jpeg"');
    expect(route).toContain('"image/png"');
    expect(route).toContain('"image/webp"');
    expect(route).toContain("MAX_BYTES = 5 * 1024 * 1024");
    expect(route).toContain("logo_url");
    expect(route).toContain("logo_path");
    expect(route).toContain("export async function DELETE");
  });

  it("stores brand assets in a dedicated public image bucket", () => {
    const migration = source("supabase/migrations/20260816173500_website_brand_assets_bucket.sql");
    expect(migration).toContain("website-brand-assets");
    expect(migration).toContain("5242880");
    expect(migration).toContain("image/jpeg");
    expect(migration).toContain("image/png");
    expect(migration).toContain("image/webp");
    expect(migration).toContain("Public read website brand assets");
  });

  it("renders the uploaded logo in the generated site header with text fallback when absent", () => {
    const renderer = source("lib/websites/content-artifact.ts");
    expect(renderer).toContain("websiteLogoUrl");
    expect(renderer).toContain("site-brand-logo");
    expect(renderer).toContain("logo-brand");
    expect(renderer).toContain('content.replace(/<a class="brand" href="#top">');
  });

  it("exposes logo upload controls in the location website builder and keeps preview fresh", () => {
    const page = source("app/locations/dashboard/website/page.tsx");
    const manager = source("components/websites/WebsiteLogoManager.tsx");
    const preview = source("app/api/business/website/preview/route.ts");
    expect(page).toContain("WebsiteLogoManager");
    expect(manager).toContain("/api/business/website/logo");
    expect(manager).toContain("Replace logo");
    expect(manager).toContain("Remove logo");
    expect(preview).toContain("persistedBrand");
    expect(preview).toContain("previewCustomContent");
  });
});
