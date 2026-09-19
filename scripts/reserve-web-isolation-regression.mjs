#!/usr/bin/env node

import fs from "node:fs";

const foundation = fs.readFileSync("infra/aws/cloudformation/reserve-web-foundation.yml", "utf8");
const service = fs.readFileSync("infra/aws/cloudformation/reserve-web-service.yml", "utf8");
const workflow = fs.readFileSync(".github/workflows/aws-reserve-web.yml", "utf8");
const dockerfile = fs.readFileSync("infra/aws/web-surfaces/Dockerfile", "utf8");
const health = fs.readFileSync("apps/reserve/app/api/health/platform-dr/route.ts", "utf8");

function requireText(source, value, message) {
  if (!source.includes(value)) throw new Error(message || `Missing: ${value}`);
}

for (const value of [
  "ReserveVpc:",
  "ReserveLoadBalancer:",
  "ReserveTargetGroup:",
  "ReserveCluster:",
  "ReserveRepository:",
  "ReserveAppEnvSecret:",
  "ReserveExecutionRole:",
  "ReserveTaskRole:",
  "ReserveWebAcl:",
  "10.44.0.0/16",
  "reserve.theouthaven.com"
]) requireText(foundation, value);

if (foundation.includes("WebVpc") || foundation.includes("toh-${Environment}-web-surfaces")) {
  throw new Error("Reserve foundation must not reuse the Admin/Business shared VPC, ALB, or ECS cluster.");
}

for (const value of [
  "ReserveTaskDefinition:",
  "ReserveService:",
  "Value: aws-reserve",
  "Value: reserve",
  "DeploymentCircuitBreaker:",
  "Rollback: true",
  "DesiredCount: !Ref DesiredCount"
]) requireText(service, value);

requireText(dockerfile, "reserve) npm run build:surface:reserve");
requireText(health, 'service: "reserve-web"');
requireText(workflow, "reserve-web-foundation.yml");
requireText(workflow, "reserve-web-service.yml");
requireText(workflow, "--build-arg \"WEB_SURFACE=reserve\"");
requireText(workflow, "reserve.theouthaven.com");
requireText(workflow, "DNS/public cutover is intentionally separate");

console.log("Dedicated Reserve AWS foundation contract passed.");
