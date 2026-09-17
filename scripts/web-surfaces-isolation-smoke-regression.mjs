#!/usr/bin/env node

import fs from 'node:fs';

const workflowPath = '.github/workflows/aws-web-surfaces-isolation-smoke.yml';
const callbackPath = 'app/auth/callback/route.ts';
const adminCallbackPath = 'app/auth/admin/callback/route.ts';
const authOriginPath = 'lib/web-surface-auth-origin.ts';
const workflow = fs.readFileSync(workflowPath, 'utf8');
const callback = fs.readFileSync(callbackPath, 'utf8');
const adminCallback = fs.readFileSync(adminCallbackPath, 'utf8');
const authOrigin = fs.readFileSync(authOriginPath, 'utf8');

function requireText(source, value, message) {
  if (!source.includes(value)) throw new Error(message || `Missing isolation smoke contract: ${value}`);
}

requireText(workflow, "workflows: ['AWS web surfaces services']", 'Isolation smoke must run after the services deployment workflow.');
requireText(workflow, "github.event.workflow_run.conclusion == 'success'", 'Isolation smoke must only run after a successful services deployment.');
requireText(workflow, "github.event.workflow_run.head_branch == 'main'", 'Isolation smoke must only verify main production deployments automatically.');
requireText(workflow, "push:\n    branches: [main]", 'Isolation smoke must run immediately when its own gate changes land on main.');
requireText(workflow, "github.event_name == 'push' && github.ref == 'refs/heads/main'", 'Main pushes for the isolation gate must execute the real production smoke.');
requireText(workflow, "ref: ${{ github.event_name == 'workflow_run' && github.event.workflow_run.head_sha || github.sha }}", 'Isolation smoke must verify the deployed services SHA or the exact main gate rollout SHA.');
requireText(workflow, 'theouthaven-web-surfaces-production', 'Isolation smoke must resolve the production web-surface foundation origin.');
requireText(workflow, '--connect-to "${host}:443:${ORIGIN}:443"', 'Isolation smoke must exercise the real HTTPS listener without changing public DNS.');
requireText(workflow, "require_allowed 'admin.theouthaven.com' '/admin/login'", 'Admin login must remain reachable on the Admin runtime.');
requireText(workflow, "require_denied 'admin.theouthaven.com' '/locations/dashboard'", 'Admin runtime must reject the Business dashboard.');
requireText(workflow, "require_denied 'admin.theouthaven.com' '/'", 'Admin runtime must reject the consumer homepage.');
requireText(workflow, "require_location_prefix 'admin.theouthaven.com' '/auth/admin/callback' 'https://admin.theouthaven.com/admin/login'", 'Admin callback failures must remain on the Admin hostname.');
requireText(workflow, "require_allowed 'business.theouthaven.com' '/login'", 'Business shared login must remain reachable.');
requireText(workflow, "require_allowed 'business.theouthaven.com' '/locations/dashboard'", 'Business dashboard must remain reachable on the Business runtime.');
requireText(workflow, "require_denied 'business.theouthaven.com' '/admin/login'", 'Business runtime must reject Admin login.');
requireText(workflow, "require_denied 'business.theouthaven.com' '/'", 'Business runtime must reject the consumer homepage.');
requireText(workflow, "require_location_prefix 'business.theouthaven.com' '/auth/callback' 'https://business.theouthaven.com/login'", 'Business callback failures must remain on the Business hostname.');
requireText(workflow, ".ok == true and .provider == $provider", 'Both isolated origins must prove their expected runtime provider.');
requireText(workflow, "status" + '" != \'404\'', 'Denied surface routes must require exact HTTP 404.');
requireText(workflow, 'No DNS/public routing changes were made.', 'Smoke verification must remain explicitly non-cutover.');

requireText(authOrigin, 'surface !== "admin" && surface !== "business"', 'Both isolated Admin and Business surfaces must preserve the forwarded request origin.');
requireText(authOrigin, 'request.headers.get("x-forwarded-host")', 'Isolated auth callback origin must respect the forwarded request hostname behind the ALB.');
requireText(authOrigin, 'request.headers.get("x-forwarded-proto")', 'Isolated auth callback origin must preserve HTTPS behind the ALB.');
requireText(authOrigin, 'if (surface === "admin") return "/admin/login";', 'Admin auth failures must return to the Admin login page.');
requireText(authOrigin, 'if (surface === "business") return "/login";', 'Business auth failures must return to the Business login page.');
requireText(callback, 'resolveWebSurfaceAuthOrigin(request, requestUrl)', 'Generic auth callback must use the surface-aware auth origin.');
requireText(callback, 'const cookieResponse = NextResponse.redirect', 'Auth exchange must retain a response object that receives Supabase cookies.');
requireText(callback, 'cookieResponse.cookies.getAll().forEach((cookie)', 'Auth exchange cookies must be copied onto the final redirect response.');
requireText(callback, 'finalResponse.cookies.set(cookie)', 'Final auth redirect must carry the newly issued session cookies.');
requireText(adminCallback, 'const origin = resolveWebSurfaceAuthOrigin(request, requestUrl);', 'Admin auth callback must use the forwarded public origin for success redirects.');
requireText(adminCallback, 'new URL("/admin/login", resolveWebSurfaceAuthOrigin(request, requestUrl))', 'Admin auth callback failures must use the forwarded public origin.');

if (/route53|change-resource-record-sets|cloudfront update-distribution/i.test(workflow)) {
  throw new Error('Isolation smoke workflow must not perform public DNS or edge cutover.');
}

console.log('web-surfaces-isolation-smoke-regression: PASS');
