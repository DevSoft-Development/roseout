import fs from "node:fs";
import path from "node:path";

describe("automatic website failback contract", () => {
  const failoverSource = fs.readFileSync(
    path.join(process.cwd(), "app/api/cron/website-failover/route.ts"),
    "utf8",
  );
  const heartbeatSource = fs.readFileSync(
    path.join(process.cwd(), "app/api/internal/hosting/node-heartbeat/route.ts"),
    "utf8",
  );
  const migrationSource = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260814224000_hosting_node_healthy_since.sql"),
    "utf8",
  );

  it("requires a sustained primary recovery window instead of a single healthy heartbeat", () => {
    expect(failoverSource).toContain("AUTO_FAILBACK_STABILITY_MS = 15 * 60 * 1000");
    expect(failoverSource).toContain("healthIsSustained(sourceNode.healthy_since)");
    expect(failoverSource).toContain('state: "failback_stabilizing"');
  });

  it("requires a fresh primary heartbeat and exact synced website version", () => {
    expect(failoverSource).toContain("healthIsFresh(sourceNode.last_health_check_at)");
    expect(failoverSource).toContain('.from("website_hosting_replicas")');
    expect(failoverSource).toContain('replica.status !== "synced"');
    expect(failoverSource).toContain('state: "failback_waiting_replica"');
  });

  it("switches platform routing before clearing failover ownership", () => {
    const routingIndex = failoverSource.indexOf("switchPlatformWildcardToNode(sourceNode.id");
    const clearIndex = failoverSource.indexOf("failover_source_node_id: null");
    expect(routingIndex).toBeGreaterThan(-1);
    expect(clearIndex).toBeGreaterThan(routingIndex);
    expect(failoverSource).toContain('state: "failed_back"');
  });

  it("tracks continuous healthy windows from node heartbeats", () => {
    expect(heartbeatSource).toContain('.select("id,status,healthy_since")');
    expect(heartbeatSource).toContain('nextStatus === "healthy"');
    expect(heartbeatSource).toContain("healthy_since: healthySince");
    expect(migrationSource).toContain("add column if not exists healthy_since timestamptz");
  });

  it("keeps automatic failback limited to managed platform domains", () => {
    expect(failoverSource).toContain("!website.platform_domain");
  });
});
