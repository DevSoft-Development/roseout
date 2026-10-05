#!/usr/bin/env node
import fs from "node:fs";

const foundation = fs.readFileSync("infra/aws/cloudformation/pos-runtime-foundation.yml", "utf8");
const control = fs.readFileSync("infra/aws/cloudformation/pos-runtime-control-plane.yml", "utf8");
const cell = fs.readFileSync("infra/aws/cloudformation/pos-runtime-cell.yml", "utf8");
const workflow = fs.readFileSync(".github/workflows/aws-pos-runtime-foundation.yml", "utf8");

function requireText(source, value, message) {
  if (!source.includes(value)) throw new Error(message || `Missing: ${value}`);
}

for (const token of [
  "pos.theouthaven.com",
  "AWS::ECS::Cluster",
  "AWS::ServiceDiscovery::PrivateDnsNamespace",
  "AWS::WAFv2::WebACL",
  "PosControlPlaneRateLimit",
  "ControlPlaneSecurityGroup",
  "CellSecurityGroup",
  "AWS::ECR::Repository",
]) requireText(foundation, token);

for (const source of [control, cell]) {
  requireText(source, "DeploymentCircuitBreaker");
  requireText(source, "Rollback: true");
  requireText(source, "AWS::ApplicationAutoScaling::ScalableTarget");
  requireText(source, "ECSServiceAverageCPUUtilization");
  requireText(source, "ECSServiceAverageMemoryUtilization");
  requireText(source, "RUNTIME_ENV_JSON");
  requireText(source, "PLATFORM_RUNTIME_PROVIDER, Value: aws-pos");
}

requireText(cell, "POS_CELL_ID");
requireText(cell, "POS_CELL_MAX_TENANTS");
requireText(cell, "MaxValue: 25");
requireText(cell, "AWS::ServiceDiscovery::Service");
requireText(cell, "AssignPublicIp: ENABLED");
if (cell.includes("TargetGroupArn") || cell.includes("AWS::ElasticLoadBalancingV2::TargetGroup")) {
  throw new Error("Tenant cells must remain private and must not be directly attached to the public ALB.");
}
requireText(workflow, "cfn-lint");
requireText(workflow, "pos-runtime-foundation.yml");
requireText(workflow, "pos-runtime-control-plane.yml");
requireText(workflow, "pos-runtime-cell.yml");
if (/change-resource-record-sets|route53/i.test(workflow)) {
  throw new Error("POS foundation validation must not perform DNS cutover.");
}

console.log("POS runtime foundation regression passed.");
