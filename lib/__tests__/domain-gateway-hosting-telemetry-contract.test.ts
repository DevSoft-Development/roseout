import fs from "node:fs";
import path from "node:path";

describe("domain gateway hosting telemetry contract", () => {
  const heartbeatRoute = fs.readFileSync(
    path.join(process.cwd(), "app/api/internal/hosting/node-heartbeat/route.ts"),
    "utf8",
  );
  const dashboard = fs.readFileSync(
    path.join(process.cwd(), "app/admin/dashboard/website-hosting/page.tsx"),
    "utf8",
  );
  const agent = fs.readFileSync(
    path.join(process.cwd(), "scripts/domain-gateway-heartbeat.mjs"),
    "utf8",
  );
  const migration = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260815173500_domain_gateway_hosting_telemetry.sql"),
    "utf8",
  );

  it("registers the Virginia domain gateway as infrastructure, not site capacity", () => {
    expect(migration).toContain("'theouthaven-domains-gateway'");
    expect(migration).toContain("'domain_gateway'");
    expect(migration).toContain("accepting_new_sites = false");
    expect(dashboard).toContain('node.node_role === "domain_gateway"');
    expect(dashboard).toContain("Not site capacity");
  });

  it("reports nginx, gateway service, and the real app health route", () => {
    expect(agent).toContain('serviceState("nginx.service")');
    expect(agent).toContain('serviceState("theouthaven-domain-gateway.service")');
    expect(agent).toContain('"http://127.0.0.1:3000/health"');
    expect(heartbeatRoute).toContain("app_health_status");
    expect(heartbeatRoute).toContain("proxy_status");
  });

  it("keeps gateway readiness separate from wildcard failover readiness", () => {
    expect(dashboard).toContain("function gatewayReady");
    expect(dashboard).toContain('node.proxy_type === "nginx"');
    expect(dashboard).toContain('node.app_health_status === "healthy"');
    expect(dashboard).toContain('node.tls_wildcard === true');
  });
});
