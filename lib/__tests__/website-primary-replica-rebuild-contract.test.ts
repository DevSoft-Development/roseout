import fs from "node:fs";
import path from "node:path";

describe("website primary replica rebuild contract", () => {
  const repairSource = fs.readFileSync(
    path.join(process.cwd(), "app/api/cron/website-replica-repair/route.ts"),
    "utf8",
  );
  const replicationSource = fs.readFileSync(
    path.join(process.cwd(), "lib/hosting/website-replication.ts"),
    "utf8",
  );
  const publishSource = fs.readFileSync(
    path.join(process.cwd(), "app/api/business/website/publish/route.ts"),
    "utf8",
  );
  const failoverSource = fs.readFileSync(
    path.join(process.cwd(), "app/api/cron/website-failover/route.ts"),
    "utf8",
  );

  it("targets the recorded failback source instead of accepting any synced replica", () => {
    expect(repairSource).toContain("failback_source_node_id");
    expect(repairSource).toContain("requiresPrimaryRebuild");
    expect(repairSource).toContain("replica.node_id === failbackSourceNodeId");
    expect(repairSource).toContain("replicateWebsiteToNode(deployRequest, failbackSourceNodeId)");
    expect(repairSource).toContain('state: "primary_rebuilt"');
  });

  it("requires both the active primary and a standby exact replica for normal live sites", () => {
    expect(repairSource).toContain("replica.node_id === hostingNodeId");
    expect(repairSource).toContain("replica.node_id !== hostingNodeId");
    expect(repairSource).toContain("replicateWebsiteToNode(deployRequest, hostingNodeId)");
    expect(repairSource).toContain("replicateWebsiteToStandby(deployRequest, hostingNodeId)");
  });

  it("records the primary exact version immediately after a successful publish deployment", () => {
    const deployIndex = publishSource.indexOf("deployWebsiteArtifact(deployInput)");
    const primaryRecordIndex = publishSource.indexOf("recordWebsiteReplicaSynced(website.id, allocation.node.id, version)");
    expect(publishSource).toContain("recordWebsiteReplicaSynced");
    expect(deployIndex).toBeGreaterThan(-1);
    expect(primaryRecordIndex).toBeGreaterThan(deployIndex);
  });

  it("only deploys a targeted replica to a healthy fresh node within load thresholds", () => {
    expect(replicationSource).toContain('node.status === "healthy"');
    expect(replicationSource).toContain("healthIsFresh(node.last_health_check_at)");
    expect(replicationSource).toContain("Number(node.cpu_percent) < 70");
    expect(replicationSource).toContain("Number(node.memory_percent) < 70");
    expect(replicationSource).toContain("Number(node.disk_percent) < 75");
    expect(replicationSource).toContain('throw new Error("replica_target_unhealthy")');
  });

  it("writes the exact version as synced after artifact deployment", () => {
    const deployIndex = replicationSource.indexOf("deployWebsiteArtifact(input");
    const syncedIndex = replicationSource.indexOf('upsertReplicaState(input.websiteId, node.id, input.version, "synced")');
    expect(deployIndex).toBeGreaterThan(-1);
    expect(syncedIndex).toBeGreaterThan(deployIndex);
  });

  it("satisfies the existing automatic failback replica requirement", () => {
    expect(failoverSource).toContain('.eq("node_id", sourceNode.id)');
    expect(failoverSource).toContain('replica.status !== "synced"');
    expect(failoverSource).toContain("Number(replica.version) !== version");
    expect(failoverSource).toContain('state: "failback_waiting_replica"');
  });
});
