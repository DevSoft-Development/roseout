import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(process.cwd(), "app/api/cron/website-failover/route.ts"), "utf8");

describe("website health status classification", () => {
  it("does not turn SEO or reservation warnings into publish failures", () => {
    expect(source).toContain('last_error: healthState === "website_unreachable" ? healthState : null');
    expect(source).toContain('deployment_status: health.site?.ok ? "deployed" : "failed"');
    expect(source).toContain('"reservation_link_unreachable"');
    expect(source).toContain('"website_seo_endpoint_unhealthy"');
  });

  it("keeps actual routing/failover failures as deployment failures", () => {
    expect(source).toContain('deployment_status: "failed", last_error: `routing_retry_failed:${message}`');
    expect(source).toContain('deployment_status: "failed", last_error: message.slice(0, 500)');
  });
});
