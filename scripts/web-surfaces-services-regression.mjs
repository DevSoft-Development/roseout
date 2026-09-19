#!/usr/bin/env node

import fs from 'node:fs';

const template = fs.readFileSync('infra/aws/cloudformation/web-surfaces-services.yml', 'utf8');
const dockerfile = fs.readFileSync('infra/aws/web-surfaces/Dockerfile', 'utf8');
const loader = fs.readFileSync('infra/aws/web-surfaces/runtime-env-loader.cjs', 'utf8');
const healthcheck = fs.readFileSync('infra/aws/web-surfaces/healthcheck.cjs', 'utf8');
const workflow = fs.readFileSync('.github/workflows/aws-web-surfaces-services.yml', 'utf8');
const proxy = fs.readFileSync('proxy.ts', 'utf8');
const businessLogin = fs.readFileSync('apps/business/app/business/login/page.tsx', 'utf8');
const adminM365Connect = fs.readFileSync('app/api/admin/integrations/microsoft-365/connect/route.ts', 'utf8');
const adminM365Callback = fs.readFileSync('app/api/admin/integrations/microsoft-365/callback/route.ts', 'utf8');
const microsoft365Oauth = fs.readFileSync('lib/microsoft-365/oauth.ts', 'utf8');
const microsoft365Config = fs.readFileSync('lib/microsoft-365/config.ts', 'utf8');
const adminTopBar = fs.readFileSync('app/admin/components/AdminTopBar.tsx', 'utf8');
const adminPortalLoginLink = fs.readFileSync('components/auth/AdminPortalLoginLink.tsx', 'utf8');
const isolatedAdminHealth = fs.readFileSync('apps/admin/app/api/health/platform-dr/route.ts', 'utf8');
const isolatedBusinessHealth = fs.readFileSync('apps/business/app/api/health/platform-dr/route.ts', 'utf8');

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
requireText(template, 'AdminImageUri:');
requireText(template, 'BusinessImageUri:');
requireText(template, 'Image: !Ref AdminImageUri');
requireText(template, 'Image: !Ref BusinessImageUri');
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

requireText(dockerfile, 'build:surface:admin');
requireText(dockerfile, 'build:surface:business');
requireText(dockerfile, 'WEB_SURFACE');
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
requireText(isolatedAdminHealth, 'PLATFORM_RUNTIME_PROVIDER', 'Isolated Admin image must expose the ALB health route.');
requireText(isolatedBusinessHealth, 'PLATFORM_RUNTIME_PROVIDER', 'Isolated Business image must expose the ALB health route.');

requireText(proxy, 'THEOUTHAVEN_WEB_SURFACE', 'AWS runtime surface isolation must be driven by the task-specific surface flag.');
requireText(proxy, 'surface === "admin" || surface === "business"', 'Only the isolated Admin and Business runtimes should activate the surface guard.');
requireText(proxy, 'pathMatches(pathname, "/admin/dashboard")', 'Admin runtime must allow its dashboard.');
requireText(proxy, 'pathname === "/admin/login"', 'Admin runtime must allow its login flow.');
requireText(proxy, 'pathMatches(pathname, "/auth/admin/callback")', 'Admin runtime must allow the admin auth callback.');
requireText(proxy, 'pathMatches(pathname, "/locations/dashboard")', 'Business runtime must allow the location dashboard.');
requireText(proxy, 'pathMatches(pathname, "/business/dashboard")', 'Business runtime must allow the business dashboard.');
requireText(proxy, 'pathname === "/business/login"', 'Business runtime must allow its dedicated login page.');
requireText(proxy, 'if (pathname === "/") {', 'Isolated AWS web surface roots must have an explicit landing behavior.');
requireText(proxy, 'loginUrl.pathname = surface === "admin" ? "/admin/login" : "/business/login";', 'Admin and Business roots must redirect to their dedicated login pages.');
requireText(proxy, 'return NextResponse.redirect(loginUrl, 302);', 'Web surface root login navigation must use an explicit redirect.');
requireText(proxy, 'return NextResponse.json({ error: "Not found" }, { status: 404 });', 'Disallowed surface routes must fail closed with 404.');
requireText(proxy, 'if (currentAwsWebSurface()) return null;', 'Vercel private-surface handoff must never run inside AWS Admin/Business runtimes.');
requireText(proxy, 'if (process.env.VERCEL_ENV !== "production") return null;', 'Private-surface handoff must only run on the production Vercel runtime.');
requireText(proxy, 'https://admin.theouthaven.com${pathname}${search}', 'Production Vercel Admin routes must hand off to the AWS Admin host.');
requireText(proxy, 'https://business.theouthaven.com${pathname}${search}', 'Production Vercel Business/Location routes must hand off to the AWS Business host.');
requireText(proxy, 'pathMatches(pathname, "/locations/dashboard")', 'Vercel handoff must cover location dashboards.');
requireText(proxy, 'pathMatches(pathname, "/business/dashboard")', 'Vercel handoff must cover business dashboards.');
requireText(proxy, '{ status: 429, headers: { "Retry-After": String(verdict.retryAfterSeconds || 60) } },', 'Rate-limit responses must keep a complete headers object and valid JSON response syntax.');
requireText(proxy, 'export const config = { matcher: ["/:path*"] };', 'Surface isolation must cover every application page path, not only Admin/API routes.');
const boundaryIndex = proxy.indexOf('const surfaceBoundaryResponse = webSurfaceBoundaryResponse(request);');
const shortLinkIndex = proxy.indexOf('const shortHostResponse = shortLinkHostResponse(request);');
if (boundaryIndex < 0 || shortLinkIndex < 0 || boundaryIndex > shortLinkIndex) {
  throw new Error('AWS surface isolation must run before normal host routing and application behavior.');
}

requireText(businessLogin, 'TheOutHaven Business', 'Dedicated Business login must use Business-specific branding.');
requireText(businessLogin, 'fetch("/api/auth/sign-in"', 'Business login must use the shared secure sign-in backend.');
requireText(businessLogin, 'queryNext?.startsWith("/business/claim")', 'Business login may only preserve a business claim continuation path.');
requireText(businessLogin, 'window.location.replace(data.redirectTo || "/business/dashboard")', 'Business login must honor the role-aware backend destination.');
requireText(businessLogin, 'https://theouthaven.com/forgot-password', 'Business login must provide password recovery.');
requireText(businessLogin, 'https://theouthaven.com/business#plans', 'Business login must provide a clear onboarding path for new businesses.');
requireText(businessLogin, 'https://theouthaven.com/login', 'Business login must provide a route back to consumer sign in.');

requireText(adminM365Connect, 'resolveWebSurfaceAuthOrigin', 'Admin M365 authorization must resolve the external Admin surface origin.');
requireText(adminM365Connect, '"/api/admin/integrations/microsoft-365/callback"', 'Admin M365 authorization must build its callback on the Admin surface.');
requireText(adminM365Connect, 'getMicrosoft365Config({ redirectUri })', 'Admin M365 authorization must pass the exact Admin callback URI into config.');
requireText(adminM365Callback, 'resolveWebSurfaceAuthOrigin', 'Admin M365 callback must resolve the external Admin surface origin.');
requireText(adminM365Callback, 'exchangeMicrosoft365Code(code, verifier, redirectUri)', 'Admin M365 code exchange must reuse the exact callback URI used for authorization.');
requireText(adminM365Callback, 'redirectToNext(origin, next', 'Admin M365 callback must return to the Admin surface origin.');
requireText(microsoft365Oauth, 'getMicrosoft365Config({ redirectUri })', 'M365 token exchange must support a request-scoped redirect URI.');
requireText(microsoft365Config, 'options?.redirectUri?.trim()', 'M365 config must permit the Admin request to supply its external callback URI.');
requireText(adminTopBar, 'window.location.href = "/admin/login";', 'Admin logout must return to the Admin-host login route.');
requireText(adminPortalLoginLink, 'https://admin.theouthaven.com/admin/login?autostart=1', 'Consumer Admin Portal link must target the AWS Admin host directly.');

const pullRequestPaths = workflow.match(/  pull_request:\n    paths:\n([\s\S]*?)\n  push:/)?.[1] || '';
const pushPaths = workflow.match(/  push:\n    branches: \[main\]\n    paths:\n([\s\S]*?)\n  workflow_dispatch:/)?.[1] || '';
for (const path of ['apps/admin/**', 'apps/business/**', 'packages/auth/**', 'packages/db/**', 'packages/config/**', 'app/auth/**', 'app/api/auth/**', 'app/api/admin/**', 'lib/**']) {
  requireText(pullRequestPaths, `- '${path}'`, `Pull request validation must run when ${path} changes.`);
  requireText(pushPaths, `- '${path}'`, `Production Admin/Business deployment must run when ${path} changes on main.`);
}

requireText(workflow, '/theouthaven/${TARGET_ENV}/edge-runtime/env', 'AWS web surfaces must source runtime configuration from the AWS compatibility secret.');
requireText(workflow, 'del(.VERCEL_TOKEN, .VERCEL_ACCESS_TOKEN)', 'Vercel deploy credentials must not be copied into ECS runtime secrets.');
requireText(workflow, 'aws secretsmanager put-secret-value --secret-id "$ADMIN_SECRET_ARN"');
requireText(workflow, 'aws secretsmanager put-secret-value --secret-id "$BUSINESS_SECRET_ARN"');
requireText(workflow, 'Build or reuse isolated Admin and Business images');
requireText(workflow, 'for surface in admin business; do', 'AWS deployment must build independently isolated surface images.');
requireText(workflow, '--build-arg "WEB_SURFACE=${surface}"');
requireText(workflow, 'IMAGE_TAG="${GITHUB_SHA}-${surface}"');
requireText(workflow, 'AdminImageUri="$ADMIN_IMAGE_URI" BusinessImageUri="$BUSINESS_IMAGE_URI"');
requireText(workflow, 'aws ecr describe-images', 'Immutable ECR tags must be checked before push so workflow reruns are idempotent.');
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
