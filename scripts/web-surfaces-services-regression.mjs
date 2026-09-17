#!/usr/bin/env node

import fs from 'node:fs';

const template = fs.readFileSync('infra/aws/cloudformation/web-surfaces-services.yml', 'utf8');
const dockerfile = fs.readFileSync('infra/aws/web-surfaces/Dockerfile', 'utf8');
const loader = fs.readFileSync('infra/aws/web-surfaces/runtime-env-loader.cjs', 'utf8');
const healthcheck = fs.readFileSync('infra/aws/web-surfaces/healthcheck.cjs', 'utf8');
const workflow = fs.readFileSync('.github/workflows/aws-web-surfaces-services.yml', 'utf8');
const proxy = fs.readFileSync('proxy.ts', 'utf8');

function requireText(source, value, message) {
  if (!source.includes(value)) throw new Error(message || `Missing: ${value}`);
}

function requireCount(source, value, count, message) {
  const actual = source.split(value).length - 1;
  if (actual !== count) throw new Error(message || `Expected ${count} occurrences of ${value}, found ${actual}.`);
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
requireCount(template, 'Name: HOSTNAME', 2, 'Both ECS web surfaces must explicitly override the container hostname used by the Next standalone server.');
requireCount(template, 'Value: 0.0.0.0', 2, 'Both ECS web surfaces must bind Next to all task interfaces so loopback and ALB health checks reach the same server.');
requireCount(template, 'Command: [CMD, node, /app/healthcheck.cjs]', 2, 'ECS health checks must execute the dedicated Node probe directly without shell quoting.');
if (template.includes('CMD-SHELL') || template.includes('node -e') || template.includes('wget -q -O /dev/null')) {
  throw new Error('ECS health checks must not depend on inline shell commands, node -e quoting, or wget.');
}

requireText(dockerfile, '.next/standalone');
requireText(dockerfile, 'runtime-env-loader.cjs');
requireText(dockerfile, 'healthcheck.cjs');
requireText(dockerfile, '--mount=type=secret,id=platform_env');
requireText(loader, 'delete process.env.RUNTIME_ENV_JSON');
requireText(healthcheck, "host: '127.0.0.1'");
requireText(healthcheck, "path: '/api/health/platform-dr'");
requireText(healthcheck, 'status >= 200 && status < 300');
requireText(healthcheck, "request.on('timeout'");
requireText(healthcheck, "request.on('error'");

requireText(proxy, 'THEOUTHAVEN_WEB_SURFACE', 'AWS runtime surface isolation must be driven by the task-specific surface flag.');
requireText(proxy, 'surface === "admin" || surface === "business"', 'Only the isolated Admin and Business runtimes should activate the surface guard.');
requireText(proxy, 'pathMatches(pathname, "/admin/dashboard")', 'Admin runtime must allow its dashboard.');
requireText(proxy, 'pathname === "/admin/login"', 'Admin runtime must allow its login flow.');
requireText(proxy, 'pathMatches(pathname, "/auth/admin/callback")', 'Admin runtime must allow the admin auth callback.');
requireText(proxy, 'pathMatches(pathname, "/locations/dashboard")', 'Business runtime must allow the location dashboard.');
requireText(proxy, 'pathMatches(pathname, "/business/dashboard")', 'Business runtime must allow the business dashboard.');
requireText(proxy, 'pathname === "/login"', 'Business runtime must allow the shared owner login flow.');
requireText(proxy, 'if (pathname === "/") {', 'Isolated AWS web surface roots must have an explicit landing behavior.');
requireText(proxy, 'loginUrl.pathname = surface === "admin" ? "/admin/login" : "/login";', 'Admin and Business roots must redirect to their login pages.');
requireText(proxy, 'return NextResponse.redirect(loginUrl, 302);', 'Web surface root login navigation must use an explicit redirect.');
requireText(proxy, 'return NextResponse.json({ error: "Not found" }, { status: 404 });', 'Disallowed surface routes must fail closed with 404.');
requireText(proxy, 'export const config = { matcher: ["/:path*"] };', 'Surface isolation must cover every application page path, not only Admin/API routes.');
const boundaryIndex = proxy.indexOf('const surfaceBoundaryResponse = webSurfaceBoundaryResponse(request);');
const shortLinkIndex = proxy.indexOf('const shortHostResponse = shortLinkHostResponse(request);');
if (boundaryIndex < 0 || shortLinkIndex < 0 || boundaryIndex > shortLinkIndex) {
  throw new Error('AWS surface isolation must run before normal host routing and application behavior.');
}

const pullRequestPaths = workflow.match(/  pull_request:\n    paths:\n([\s\S]*?)\n  push:/)?.[1] || '';
const pushPaths = workflow.match(/  push:\n    branches: \[main\]\n    paths:\n([\s\S]*?)\n  workflow_dispatch:/)?.[1] || '';
for (const path of ['app/auth/**', 'app/api/auth/**', 'lib/**']) {
  requireText(pullRequestPaths, `- '${path}'`, `Pull request validation must run when ${path} changes.`);
  requireText(pushPaths, `- '${path}'`, `Production Admin/Business deployment must run when ${path} changes on main.`);
}

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
requireText(workflow, 'UPDATE_FAILED', 'Non-terminal failed updates must be detected before another deploy attempt.');
requireText(workflow, 'aws cloudformation rollback-stack --stack-name "$STACK"', 'UPDATE_FAILED stacks must be rolled back to the last known good state.');
requireText(workflow, 'aws cloudformation wait stack-rollback-complete --stack-name "$STACK"', 'The workflow must wait for rollback completion before retrying deployment.');
requireText(workflow, 'ROLLBACK_ARGS=()', 'CloudFormation deploys must choose rollback mode dynamically.');
requireText(workflow, 'if aws cloudformation describe-stacks --stack-name "$STACK" >/dev/null 2>&1; then', 'Existing service stacks must be detected before choosing rollback mode.');
requireText(workflow, "Updating existing services stack with normal rollback support so ECS task definition replacements are allowed.", 'Existing stack updates must allow task definition replacement.');
requireText(workflow, 'ROLLBACK_ARGS=(--disable-rollback)', 'Only fresh stack creation should disable rollback for startup diagnostics.');
requireText(workflow, '"${ROLLBACK_ARGS[@]}"', 'CloudFormation deploy must consume the conditional rollback arguments.');
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
