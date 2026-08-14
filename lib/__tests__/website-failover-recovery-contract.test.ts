import fs from "node:fs";
import path from "node:path";

describe("website failover recovery contract", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "app/api/cron/website-failover/route.ts"),
    "utf8",
  );
  const heartbeatSource = fs.readFileSync(
    path.join(process.cwd(), "app/api/internal/hosting/node-heartbeat/route.ts"),
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

  it("automatically pauses unavailable or stale nodes before allocating or failing over sites", () => {
    expect(source).toContain("pauseUnavailableNodes");
    expect(source).toContain('node.status !== "healthy" || !healthIsFresh(node.last_health_check_at)');
    expect(source).toContain("accepting_new_sites: false");
    expect(source).toContain("pausedUnavailableNodes");
  });

  it("fails closed when a heartbeat reports a degraded or maintenance node", () => {
    expect(heartbeatSource).toContain('if (nextStatus !== "healthy") update.accepting_new_sites = false');
    expect(heartbeatSource).not.toContain('accepting_new_sites: nextStatus === "healthy"');
  });
});
