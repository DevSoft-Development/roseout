import fs from "node:fs";
import path from "node:path";

describe("hosted website SEO, performance, and accessibility contract", () => {
  const seo = fs.readFileSync(path.join(process.cwd(), "lib/websites/seo-accessibility-artifact.ts"), "utf8");
  const content = fs.readFileSync(path.join(process.cwd(), "lib/websites/content-artifact.ts"), "utf8");

  it("adds canonical, social, and structured metadata", () => {
    expect(seo).toContain('rel="canonical"');
    expect(seo).toContain('property="og:title"');
    expect(seo).toContain('name="twitter:card"');
    expect(seo).toContain('application/ld+json');
    expect(seo).toContain('"@type": "LocalBusiness"');
  });

  it("generates sitemap and robots artifacts from the existing published domain", () => {
    expect(seo).toContain('path: "sitemap.xml"');
    expect(seo).toContain('path: "robots.txt"');
    expect(seo).toContain("getWebsiteLiveUrl");
  });

  it("adds keyboard and motion accessibility protections", () => {
    expect(seo).toContain("Skip to content");
    expect(seo).toContain(":focus-visible");
    expect(seo).toContain("prefers-reduced-motion:reduce");
    expect(seo).toContain('id="main-content"');
  });

  it("keeps image and iframe performance improvements on the existing render path", () => {
    expect(seo).toContain('fetchpriority="high"');
    expect(seo).toContain('loading="lazy"');
    expect(seo).toContain('decoding="async"');
    expect(content).toContain("enhanceWebsiteSeoAccessibility(paged,website,location)");
    expect(content).toContain("addGeneratedWebsitePages(routed)");
  });
});
