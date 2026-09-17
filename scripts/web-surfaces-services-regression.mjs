#!/usr/bin/env node

import fs from 'node:fs';

const template = fs.readFileSync('infra/aws/cloudformation/web-surfaces-services.yml', 'utf8');
const dockerfile = fs.readFileSync('infra/aws/web-surfaces/Dockerfile', 'utf8');
const loader = fs.readFileSync('infra/aws/web-surfaces/runtime-env-loader.cjs', 'utf8');
const workflow = fs.readFileSync('.github/workflows/aws-web-surfaces-services.yml', 'utf8');

function requireText(source, value, message) {
  if (!source.includes(value)) throw new Error(message || `Missing: ${value}`);
}

requireText(template, 'AdminTaskDefinition:', 'Admin must have its own task definition.');
requireText(template, 'BusinessTaskDefinition:', 'Business must have its own task definition.');
requireText(template, 'AdminService:', 'Admin must have its own ECS service.');
requireText(template, 'BusinessService:', 'Business must have its own ECS service.');
requireText(template, 'Value: aws-admin');
requireText(template, 'Value: aws-business');
requireText(template, 'AdminAppEnvSecretArn');
requireText(template, 'BusinessAppEnvSecretArn');
requireText(template, 'AdminTaskRoleArn');
requireText(template, 'BusinessTaskRoleArn');
requireText(template, 'DeploymentCircuitBreaker:');
requireText(template, 'Rollback: true');
requireText(template, 'DesiredCount: !Ref DesiredCount');

requireText(dockerfile, '.next/standalone');
requireText(dockerfile, 'runtime-env-loader.cjs');
requireText(dockerfile, '--mount=type=secret,id=platform_env');
requireText(loader, 'delete process.env.RUNTIME_ENV_JSON');

requireText(workflow, '/theouthaven/${TARGET_ENV}/edge-runtime/env', 'AWS web surfaces must source runtime configuration from the AWS compatibility secret.');
requireText(workflow, 'del(.VERCEL_TOKEN, .VERCEL_ACCESS_TOKEN)', 'Vercel deploy credentials must not be copied into ECS runtime secrets.');
requireText(workflow, 'aws secretsmanager put-secret-value --secret-id "$ADMIN_SECRET_ARN"');
requireText(workflow, 'aws secretsmanager put-secret-value --secret-id "$BUSINESS_SECRET_ARN"');
requireText(workflow, 'docker push "$IMAGE_URI"');
requireText(workflow, 'aws ecs wait services-stable');
requireText(workflow, 'Direct-origin smoke test');
requireText(workflow, 'DNS/public routing has not been changed');

if (/credential-vault\/\$\{TARGET_ENV\}\/vercel|vercel env pull|VERCEL_RUNTIME_TOKEN/.test(workflow)) {
  throw new Error('AWS web surface deployment must not depend on a Vercel API token.');
}

if (/route53|change-resource-record-sets|cloudfront update-distribution/i.test(workflow)) {
  throw new Error('Service deployment workflow must not perform public DNS/edge cutover.');
}

console.log('Admin/Business ECS service boundary regression passed.');
