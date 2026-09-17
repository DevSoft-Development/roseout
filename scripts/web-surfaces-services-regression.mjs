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
requireText(workflow, 'Build or reuse immutable application image');
requireText(workflow, 'aws ecr describe-images', 'Immutable ECR tags must be checked before push so workflow reruns are idempotent.');
requireText(workflow, '--image-ids imageTag="$GITHUB_SHA"', 'ECR reuse must be keyed by the immutable Git SHA tag.');
requireText(workflow, 'Reusing existing immutable ECR image for ${GITHUB_SHA}.');
requireText(workflow, 'docker push "$IMAGE_URI"');
requireText(workflow, 'Recover failed services stack');
requireText(workflow, 'ROLLBACK_COMPLETE');
requireText(workflow, 'CREATE_FAILED', 'Preserved failed CloudFormation stacks must be cleaned before the next retry.');
requireText(workflow, 'aws cloudformation delete-stack --stack-name "$STACK"');
requireText(workflow, 'aws cloudformation wait stack-delete-complete --stack-name "$STACK"');
requireText(workflow, '--disable-rollback', 'ECS startup failures must be preserved long enough for runtime diagnostics.');
requireText(workflow, 'Show CloudFormation service failure events');
requireText(workflow, 'Show ECS service, stopped-task, and CloudWatch diagnostics');
requireText(workflow, 'aws ecs describe-services');
requireText(workflow, 'aws ecs list-tasks');
requireText(workflow, '--family "$SERVICE"', 'Failed ECS diagnostics must fall back to the task family when service lookup does not expose stopped tasks.');
requireText(workflow, 'No stopped ECS tasks found for $SERVICE by service name or task family.');
requireText(workflow, 'aws ecs describe-tasks');
requireText(workflow, 'aws logs tail "$LOG_GROUP" --since 30m --format short', 'Failed ECS deployments must surface CloudWatch application logs.');
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
