#!/usr/bin/env node

import fs from 'node:fs';

const workflowPath = '.github/workflows/aws-web-surfaces-isolation-smoke.yml';
const workflow = fs.readFileSync(workflowPath, 'utf8');

function requireText(value, message) {
  if (!workflow.includes(value)) throw new Error(message || `Missing isolation smoke contract: ${value}`);
}

requireText("workflows: ['AWS web surfaces services']", 'Isolation smoke must run after the services deployment workflow.');
requireText("github.event.workflow_run.conclusion == 'success'", 'Isolation smoke must only run after a successful services deployment.');
requireText("github.event.workflow_run.head_branch == 'main'", 'Isolation smoke must only verify main production deployments automatically.');
requireText("ref: ${{ github.event.workflow_run.head_sha }}", 'Isolation smoke must verify the exact deployed commit.');
requireText('theouthaven-web-surfaces-production', 'Isolation smoke must resolve the production web-surface foundation origin.');
requireText("require_allowed 'admin.theouthaven.com' '/admin/login'", 'Admin login must remain reachable on the Admin runtime.');
requireText("require_denied 'admin.theouthaven.com' '/locations/dashboard'", 'Admin runtime must reject the Business dashboard.');
requireText("require_denied 'admin.theouthaven.com' '/'", 'Admin runtime must reject the consumer homepage.');
requireText("require_allowed 'business.theouthaven.com' '/login'", 'Business shared login must remain reachable.');
requireText("require_allowed 'business.theouthaven.com' '/locations/dashboard'", 'Business dashboard must remain reachable on the Business runtime.');
requireText("require_denied 'business.theouthaven.com' '/admin/login'", 'Business runtime must reject Admin login.');
requireText("require_denied 'business.theouthaven.com' '/'", 'Business runtime must reject the consumer homepage.');
requireText(".ok == true and .provider == $provider", 'Both isolated origins must prove their expected runtime provider.');
requireText("status" + '" != \'404\'', 'Denied surface routes must require exact HTTP 404.');
requireText("No DNS/public routing changes were made.", 'Smoke verification must remain explicitly non-cutover.');

if (/route53|change-resource-record-sets|cloudfront update-distribution/i.test(workflow)) {
  throw new Error('Isolation smoke workflow must not perform public DNS or edge cutover.');
}

console.log('web-surfaces-isolation-smoke-regression: PASS');
