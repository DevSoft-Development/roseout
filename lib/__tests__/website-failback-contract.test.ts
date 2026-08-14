import fs from "node:fs";
import path from "node:path";

describe("website failback contract", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "app/api/admin/website-hosting/failback/route.ts"),
    "utf8",
  );

  it("is restricted to superadmins", () => {
    expect(source).toContain('requireAdminApiRole(["superadmin"])');
  });

  it("fails closed unless the original node is healthy with a fresh heartbeat", () => {
    expect(source).toContain('node.status !== "healthy"');
    expect(source).toContain("healthIsFresh(node.last_health_check_at)");
    expect(source).toContain('error: "target_node_not_healthy"');
  });

  it("requires the exact published version to be verified on the target node", () => {
    expect(source).toContain('.from("website_hosting_replicas")');
    expect(source).toContain('replica.status !== "synced"');
    expect(source).toContain('error: "target_node_version_not_verified"');
  });

  it("switches wildcard routing before updating hosting state", () => {
    expect(source).toContain("switchPlatformWildcardToNode(node.id");
    expect(source).toContain("hosting_node_id: node.id");
    expect(source).toContain("failover_source_node_id: null");
    expect(source).toContain('state: "failed_back"');
  });
});
