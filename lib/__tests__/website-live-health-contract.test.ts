import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("hosted website live health contract", () => {
  const root = process.cwd();
  const healthRoute = readFileSync(join(root, "app/api/business/website/health/route.ts"), "utf8");
  const liveHealth = readFileSync(join(root, "lib/websites/live-health.ts"), "utf8");
  const panel = readFileSync(join(root, "components/websites/WebsiteHealthPanel.tsx"), "utf8");

  it("keeps health on the existing owner website endpoint", () => {
    expect(healthRoute).toContain("checkHostedWebsiteLiveHealth");
    expect(healthRoute).toContain("getWebsiteLiveUrl");
    expect(healthRoute).toContain("getGeneratedWebsiteLocationSnapshot");
  });

  it("checks the published site and generated SEO files", () => {
    expect(liveHealth).toContain("/sitemap.xml");
    expect(liveHealth).toContain("/robots.txt");
    expect(liveHealth).toContain("AbortSignal.timeout");
    expect(liveHealth).toContain("cache: \"no-store\"");
  });

  it("checks external reservation links without changing reservation storage", () => {
    expect(healthRoute).toContain("content.reservation_link");
    expect(healthRoute).toContain("content.uses_internal_reservations");
    expect(healthRoute).not.toContain("from(\"website_reservations\")");
  });

  it("surfaces live response details and manual refresh to the owner", () => {
    expect(panel).toContain("Live response:");
    expect(panel).toContain("Check now");
    expect(panel).toContain("response_ms");
  });
});
