#!/usr/bin/env node

import fs from "node:fs";

const templatePath = "infra/aws/cloudformation/web-surfaces-foundation.yml";
const policyPath = "infra/aws/iam/web-surfaces-bootstrap-policy.json";
const source = fs.readFileSync(templatePath, "utf8");
const policy = fs.readFileSync(policyPath, "utf8");

const required = [
  "AWS::ECS::Cluster",
  "AWS::ECR::Repository",
  "AdminTargetGroup:",
  "BusinessTargetGroup:",
  "AdminAppEnvSecretArn:",
  "BusinessAppEnvSecretArn:",
  "TheOutHavenAdminWebTask-${Environment}",
  "TheOutHavenBusinessWebTask-${Environment}",
  "AdminHostRule:",
  "BusinessHostRule:",
  "HealthCheckPath: /api/health/platform-dr",
  "!GetAtt AdminLogGroup.Arn",
  "!GetAtt BusinessLogGroup.Arn",
];

for (const token of required) {
  if (!source.includes(token)) throw new Error(`Missing web-surface foundation contract: ${token}`);
}

if (source.includes("AWS::ECS::Service")) {
  throw new Error("Foundation stack must not start ECS services before a verified image/runtime deployment exists.");
}

if (source.includes("Type: AWS::SecretsManager::Secret")) {
  throw new Error("Foundation stack must reference runtime secrets rather than own them, so retained secrets survive stack recreation safely.");
}

if (!source.includes("!Ref AdminAppEnvSecretArn") || !source.includes("!Ref BusinessAppEnvSecretArn")) {
  throw new Error("Admin and Business runtime secret ARNs must remain isolated and explicitly referenced.");
}

if (source.includes("${AdminLogGroup.Arn}:*") || source.includes("${BusinessLogGroup.Arn}:*")) {
  throw new Error("CloudWatch LogGroup Arn already includes :*; appending another wildcard breaks ECS log-stream permissions.");
}

if (!policy.includes('"logs:FilterLogEvents"')) {
  throw new Error("Web-surface deploy role must be able to read ECS CloudWatch logs after a failed deployment.");
}

if (!policy.includes('"cloudformation:RollbackStack"')) {
  throw new Error("Web-surface deploy role must be able to recover an UPDATE_FAILED services stack before retrying deployment.");
}

console.log("web-surfaces-foundation-regression: PASS");
