import fs from "node:fs";
import path from "node:path";

describe("controlled hosting live DR drill contract", () => {
  const routeSource = fs.readFileSync(
    path.join(process.cwd(), "app/api/admin/hosting/live-drill/route.ts"),
    "utf8",
  );
  const panelSource = fs.readFileSync(
    path.join(process.cwd(), "components/admin/HostingDrTestPanel.tsx"),
    "utf8",
  );

  it("is admin-only and requires an exact typed confirmation", () => {
    expect(routeSource).toContain("requireAdminRole(ADMIN_PAGE_ACCESS.dashboard)");
    expect(routeSource).toContain('const CONFIRMATION = "LIVE DR THEOUTHAVEN LOUNGE"');
    expect(routeSource).toContain("confirmation !== CONFIRMATION");
  });

  it("hard-gates the target to the hidden demo mirror", () => {
    expect(routeSource).toContain('const DEMO_KEY = "real_location_mirror_demo"');
    expect(routeSource).toContain('.eq("is_demo", true)');
    expect(routeSource).toContain('.eq("demo_visible_publicly", false)');
    expect(routeSource).toContain('.eq("public_visibility_tier", "hidden")');
    expect(routeSource).toContain("live_dr_demo_must_not_use_customer_domain");
  });

  it("requires an exact healthy failover replica and forbids emergency deployment", () => {
    expect(routeSource).toContain("findExactHealthyReplica");
    expect(routeSource).toContain('exactReplica.role !== "failover"');
    expect(routeSource).toContain('recovery.recoveryMode !== "exact_replica"');
    expect(routeSource).toContain("live_dr_emergency_deploy_not_allowed");
  });

  it("performs live wildcard failover only after preflight", () => {
    const replicaIndex = routeSource.indexOf("findExactHealthyReplica");
    const failoverIndex = routeSource.indexOf("failoverWebsiteToHealthyNode");
    const routingIndex = routeSource.indexOf("switchPlatformWildcardToNode(recovery.node.id");
    expect(replicaIndex).toBeGreaterThan(-1);
    expect(failoverIndex).toBeGreaterThan(replicaIndex);
    expect(routingIndex).toBeGreaterThan(failoverIndex);
  });

  it("keeps failback as a separate manual operation with health, stability, and exact replica gates", () => {
    expect(routeSource).toContain('action === "failback"');
    expect(routeSource).toContain("isFresh(sourceNode.last_health_check_at)");
    expect(routeSource).toContain("isSustained(sourceNode.healthy_since)");
    expect(routeSource).toContain('.eq("node_id", sourceNode.id)');
    expect(routeSource).toContain('replica.status !== "synced"');
    expect(panelSource).toContain('executeLive("failover")');
    expect(panelSource).toContain('executeLive("failback")');
  });

  it("makes destructive scope clear in the admin UI", () => {
    expect(panelSource).toContain("Manual production operation");
    expect(panelSource).toContain("Controlled live DR drill — demo only");
    expect(panelSource).toContain("These buttons perform real routing changes");
  });
});
