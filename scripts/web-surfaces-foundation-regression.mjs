#!/usr/bin/env node

import fs from "node:fs";

const templatePath = "infra/aws/cloudformation/web-surfaces-foundation.yml";
const source = fs.readFileSync(templatePath, "utf8");

const required = [
  "AWS::ECS::Cluster",
  "AWS::ECR::Repository",
  "AdminTargetGroup:",
  "BusinessTargetGroup:",
  "/theouthaven/${Environment}/admin-web/app-env",
  "/theouthaven/${Environment}/business-web/app-env",
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

if (!source.includes("AdminAppEnvSecret") || !source.includes("BusinessAppEnvSecret")) {
  throw new Error("Admin and Business runtime secrets must remain isolated.");
}

console.log("web-surfaces-foundation-regression: PASS");
