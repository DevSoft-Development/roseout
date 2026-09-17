#!/usr/bin/env node

import fs from "node:fs";

const templatePath = "infra/aws/cloudformation/web-surfaces-foundation.yml";
const policyPath = "infra/aws/iam/web-surfaces-bootstrap-policy.json";
const workflowPath = ".github/workflows/aws-web-surfaces-foundation.yml";
const source = fs.readFileSync(templatePath, "utf8");
const policy = fs.readFileSync(policyPath, "utf8");
const workflow = fs.readFileSync(workflowPath, "utf8");

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
  "CertificateArn:",
  "HttpsListener:",
  "Port: 443",
  "Protocol: HTTPS",
  "ELBSecurityPolicy-TLS13-1-2-2021-06",
  "AdminHttpsHostRule:",
  "BusinessHttpsHostRule:",
  "AWS::WAFv2::WebACL",
  "AWSManagedRulesCommonRuleSet",
  "AWSManagedRulesKnownBadInputsRuleSet",
  "AWS::WAFv2::WebACLAssociation",
  "WebAclArn:",
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

for (const permission of [
  '"logs:FilterLogEvents"',
  '"cloudformation:RollbackStack"',
  '"acm:ListCertificates"',
  '"acm:DescribeCertificate"',
  '"wafv2:CreateWebACL"',
  '"wafv2:UpdateWebACL"',
  '"wafv2:AssociateWebACL"',
  '"wafv2:GetWebACLForResource"',
  '"elasticloadbalancing:SetWebACL"',
]) {
  if (!policy.includes(permission)) throw new Error(`Web-surface deploy role is missing required permission ${permission}.`);
}

for (const token of [
  "Resolve issued wildcard TLS certificate",
  "CertificateSummaryList[?DomainName=='*.theouthaven.com']",
  "CertificateArn=\"$CERTIFICATE_ARN\"",
  "Verify HTTPS listener and managed WAF protection",
  "aws wafv2 get-web-acl-for-resource",
  "--connect-to \"${HOST}:443:${ORIGIN}:443\"",
  "https://${HOST}/api/health/platform-dr",
  "Public DNS has not been changed",
]) {
  if (!workflow.includes(token)) throw new Error(`Foundation workflow is missing TLS/WAF verification contract: ${token}`);
}

if (/route53.*change-resource-record-sets|cloudfront update-distribution/i.test(workflow)) {
  throw new Error("TLS/WAF foundation rollout must not perform public DNS or edge cutover.");
}

console.log("web-surfaces-foundation-regression: PASS");
