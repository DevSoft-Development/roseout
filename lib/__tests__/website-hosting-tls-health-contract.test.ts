import fs from "node:fs";
import path from "node:path";

describe("website hosting TLS health contract", () => {
  const dashboard = fs.readFileSync(
    path.join(process.cwd(), "app/admin/dashboard/website-hosting/page.tsx"),
    "utf8",
  );
  const heartbeat = fs.readFileSync(
    path.join(process.cwd(), "app/api/internal/hosting/node-heartbeat/route.ts"),
    "utf8",
  );
  const migration = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260815165000_hosting_node_tls_health.sql"),
    "utf8",
  );
  const agent = fs.readFileSync(
    path.join(process.cwd(), "scripts/website-hosting-node-heartbeat.mjs"),
    "utf8",
  );

  it("stores certificate and service telemetry on hosting nodes", () => {
    expect(migration).toContain("tls_cert_expires_at timestamptz");
    expect(migration).toContain("caddy_status text");
    expect(migration).toContain("certbot_timer_status text");
    expect(migration).toContain("tls_wildcard boolean");
  });

  it("accepts optional TLS telemetry through the signed heartbeat", () => {
    expect(heartbeat).toContain("caddyStatus?: string");
    expect(heartbeat).toContain("tlsCertExpiresAt?: string");
    expect(heartbeat).toContain("telemetry.tls_cert_expires_at");
    expect(heartbeat).toContain("invalid_tls_telemetry");
  });

  it("reports local Caddy, Certbot timer, and wildcard certificate state", () => {
    expect(agent).toContain('serviceState("caddy.service")');
    expect(agent).toContain('serviceState("certbot.timer"');
    expect(agent).toContain('DNS:*.theouthaven.com');
    expect(agent).toContain("tlsCertExpiresAt");
  });

  it("shows failover-ready TLS status on the website hosting admin page", () => {
    expect(dashboard).toContain('label="Failover-ready TLS"');
    expect(dashboard).toContain("Server, TLS, and failover readiness");
    expect(dashboard).toContain("node.certbot_timer_status === \"active\"");
    expect(dashboard).toContain("remaining > 30");
  });
});
