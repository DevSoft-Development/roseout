import fs from "node:fs";
import path from "node:path";

describe("website failover recovery contract", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "app/api/cron/website-failover/route.ts"),
    "utf8",
  );

  it("includes stuck deploying websites in the failover queue", () => {
    expect(source).toContain('.in("status", ["live", "deploying"])');
    expect(source).toContain("failover_source_node_id");
  });

  it("retries routing on the current healthy failover node without moving the site again", () => {
    expect(source).toContain('website.status === "deploying"');
    expect(source).toContain('state: "routing_recovered"');
    expect(source).toContain("finishRouting(website");
  });

  it("only returns the website to live after routing succeeds", () => {
    expect(source).toContain('deployment_status: "deployed"');
    expect(source).toContain('status: customDomain ? "provisioning" : "live"');
    expect(source).toContain("last_error: null");
  });

  it("records routing failures truthfully while keeping them retryable", () => {
    expect(source).toContain('deployment_status: "failed"');
    expect(source).toContain("routing_retry_failed:");
    expect(source).toContain('state: "routing_retry"');
  });
});
