import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("Lightsail customer website hosting contract", () => {
  it("never connects customer domains to the Vercel project", () => {
    const route = source("app/api/business/domains/connect/route.ts");
    expect(route).not.toContain("addDomainToVercelProject");
    expect(route).not.toContain("vercel-project-domain");
    expect(route).toContain("allocateLightsailWebsiteNode");
    expect(route).toContain("configureDomainDns");
  });

  it("uses direct Lightsail DNS records", () => {
    const route = source("app/api/business/domains/connect/route.ts");
    expect(route).toContain("buildDnsRecords(domain, node.public_ip, domain)");
  });

  it("keeps the first node fail-closed until health is verified", () => {
    const migration = source("supabase/migrations/20260813200500_lightsail_customer_website_hosting.sql");
    expect(migration).toContain("'toh-web-node-01'");
    expect(migration).toContain("'34.205.242.37'::inet");
    expect(migration).toContain("'provisioning'");
    expect(migration).toContain("false");
  });

  it("tracks hosting, deployment, DNS and SSL lifecycle state", () => {
    const migration = source("supabase/migrations/20260813200500_lightsail_customer_website_hosting.sql");
    expect(migration).toContain("website_hosting_nodes");
    expect(migration).toContain("business_websites");
    expect(migration).toContain("deployment_status");
    expect(migration).toContain("dns_status");
    expect(migration).toContain("ssl_status");
    expect(migration).toContain("last_health_check_at");
  });

  it("serves customer files from the shared Lightsail site root", () => {
    const allocator = source("lib/hosting/lightsail-nodes.ts");
    expect(allocator).toContain("/srv/sites/${locationId}");
    expect(allocator).toContain("no_healthy_hosting_capacity");
    expect(allocator).toContain("accepting_new_sites");
    expect(allocator).toContain("isFreshHealthCheck");
  });
});
