import fs from "node:fs";
import path from "node:path";

describe("hosting DR simulation contract", () => {
  const simulationSource = fs.readFileSync(
    path.join(process.cwd(), "lib/hosting/dr-simulation.ts"),
    "utf8",
  );
  const routeSource = fs.readFileSync(
    path.join(process.cwd(), "app/api/admin/hosting/dr-test/route.ts"),
    "utf8",
  );
  const panelSource = fs.readFileSync(
    path.join(process.cwd(), "components/admin/HostingDrTestPanel.tsx"),
    "utf8",
  );
  const migrationSource = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260815191500_hosting_dr_test_runs.sql"),
    "utf8",
  );

  it("keeps the admin operation authenticated and simulation-only", () => {
    expect(routeSource).toContain("requireAdminRole(ADMIN_PAGE_ACCESS.dashboard)");
    expect(simulationSource).toContain('mode: "simulation"');
    expect(migrationSource).toContain("check (mode in ('simulation'))");
  });

  it("never imports production mutation functions into the simulation", () => {
    expect(simulationSource).not.toContain("switchPlatformWildcardToNode");
    expect(simulationSource).not.toContain("connectGeneratedSiteDomain");
    expect(simulationSource).not.toContain("moveWebsiteToLightsailNode");
    expect(simulationSource).not.toContain("deployWebsiteArtifact");
  });

  it("validates exact-version failover and failback replica coverage", () => {
    expect(simulationSource).toContain("exactReplica(replicas, website, target.id)");
    expect(simulationSource).toContain("exactReplica(replicas, website, source.id)");
    expect(simulationSource).toContain('key: "wildcard_coverage"');
    expect(simulationSource).toContain('key: "primary_replica_for_failback"');
    expect(simulationSource).toContain("FAILBACK_STABILITY_MS = 15 * 60 * 1000");
  });

  it("persists human-readable pass warn fail evidence", () => {
    expect(migrationSource).toContain("status text not null check (status in ('pass', 'warn', 'fail'))");
    expect(migrationSource).toContain("results jsonb not null");
    expect(panelSource).toContain("Run E2E DR Test");
    expect(panelSource).toContain("Real failover and DNS actions remain separate operations");
  });
});
