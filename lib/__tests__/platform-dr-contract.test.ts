import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("platform cross-cloud DR contract", () => {
  it("links the shared failover control from Cloud Infrastructure", () => {
    const infrastructure = source("app/admin/dashboard/infrastructure/page.tsx");
    const failoverPage = source("app/admin/dashboard/infrastructure/failover/page.tsx");
    expect(infrastructure).toContain('/admin/dashboard/infrastructure/failover');
    expect(infrastructure).toContain('Failover & DR');
    expect(failoverPage).toContain('<PlatformDrPanel />');
    expect(failoverPage).toContain('Vercel');
    expect(failoverPage).toContain('AWS us-west-2');
    expect(failoverPage).toContain('Virginia → Oregon');
  });

  it("protects live controls while leaving only the origin health marker public", () => {
    const adminRoute = source("app/api/admin/platform-dr/route.ts");
    const healthRoute = source("app/api/health/platform-dr/route.ts");
    expect(adminRoute).toContain('requireAdminRole(ADMIN_PAGE_ACCESS.productionFinishLine)');
    expect(adminRoute).toContain('LIVE PLATFORM FAILOVER');
    expect(healthRoute).toContain('x-toh-platform-origin');
    expect(healthRoute).toContain('cache-control');
  });

  it("uses an expiring AWS-side failover override and probes all three surfaces", () => {
    const gateway = source("infra/aws/lambda/platform_dr_gateway.py");
    expect(gateway).toContain('/v1/health/primary');
    expect(gateway).toContain('forced_failover');
    expect(gateway).toContain('duration = max(60, min(300, duration))');
    expect(gateway).toContain('/admin/login');
    expect(gateway).toContain('/locations/dashboard');
    expect(gateway).toContain('expected_origin');
  });

  it("keeps the AWS standby warm behind CloudFront and fast Route 53 health detection", () => {
    const compute = source("infra/aws/cloudformation/platform-dr-compute.yml");
    const edge = source("infra/aws/cloudformation/platform-dr-edge.yml");
    expect(compute).toContain('AWS::ECS::Cluster');
    expect(compute).toContain('AWS::ElasticLoadBalancingV2::LoadBalancer');
    expect(compute).toContain('AWS::ECR::Repository');
    expect(compute).toContain('x-toh-edge-secret');
    expect(edge).toContain('AWS::CloudFront::Distribution');
    expect(edge).toContain('AWS::Route53::HealthCheck');
    expect(edge).toContain('RequestInterval: 10');
    expect(edge).toContain('FailureThreshold: 2');
  });

  it("builds the same Next.js application as a standalone non-root AWS image", () => {
    const config = source("next.config.ts");
    const dockerfile = source("infra/aws/platform-dr/Dockerfile");
    expect(config).toContain('output: "standalone"');
    expect(dockerfile).toContain('.next/standalone');
    expect(dockerfile).toContain('USER nextjs');
    expect(dockerfile).toContain('PLATFORM_RUNTIME_PROVIDER=aws-dr');
  });

  it("requires the UI to verify public, admin, and locations before completing a live drill", () => {
    const panel = source("components/admin/PlatformDrPanel.tsx");
    expect(panel).toContain('["/", "/admin/login", "/locations/dashboard"]');
    expect(panel).toContain('waitForOrigin("aws-dr")');
    expect(panel).toContain('waitForOrigin("vercel")');
    expect(panel).toContain('durationSeconds: 180');
  });
});
