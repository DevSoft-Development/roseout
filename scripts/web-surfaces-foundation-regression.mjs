#!/usr/bin/env node

import fs from "node:fs";

const templatePath = "infra/aws/cloudformation/web-surfaces-foundation.yml";
const source = fs.readFileSync(templatePath, "utf8");

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

console.log("web-surfaces-foundation-regression: PASS");
