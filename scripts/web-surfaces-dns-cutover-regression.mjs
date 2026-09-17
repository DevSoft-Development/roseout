#!/usr/bin/env node

import fs from 'node:fs';

const path = '.github/workflows/aws-web-surfaces-dns-cutover.yml';
const workflow = fs.readFileSync(path, 'utf8');

function requireText(value, message) {
  if (!workflow.includes(value)) throw new Error(message || `Missing DNS cutover safety contract: ${value}`);
}

function forbid(pattern, message) {
  if (pattern.test(workflow)) throw new Error(message);
}

requireText('workflow_dispatch:', 'Application DNS cutover must require an explicit manual workflow dispatch.');
requireText("- plan\n          - cutover\n          - rollback", 'Cutover workflow must retain plan, cutover, and rollback modes.');
requireText('CUTOVER_ADMIN_BUSINESS', 'Cutover must require the exact operator confirmation token.');
requireText('ROLLBACK_ADMIN_BUSINESS', 'Rollback must require the exact operator confirmation token.');
requireText('environment: production', 'Traffic changes must remain behind the production environment gate.');
requireText('cancel-in-progress: false', 'A running cutover or rollback must not be cancelled by another invocation.');
requireText('SNAPSHOT_SECRET: theouthaven/production/web-surfaces/dns-cutover-last-snapshot', 'The pre-cutover DNS state must retain dedicated rollback storage.');
requireText('aws secretsmanager create-secret', 'Cutover must be able to create persistent rollback snapshot storage.');
requireText('aws secretsmanager put-secret-value', 'Cutover must update the saved rollback snapshot before changing DNS.');
requireText('aws secretsmanager get-secret-value', 'Automatic and manual rollback must be able to retrieve the saved DNS snapshot.');
requireText('Save rollback snapshot', 'Cutover must persist the exact prior Route 53 state before changing traffic.');
requireText('Verify isolated AWS origins before DNS changes', 'AWS Admin/Business origins must be healthy before Route 53 changes.');
requireText('--connect-to "${host}:443:${ALB_DNS}:443"', 'Preflight must exercise the real HTTPS listener without relying on public DNS.');
requireText("selected = ['admin', 'business'] if scope == 'both' else [scope]", 'The cutover scope must remain limited to the Admin and Business surfaces.');
requireText("f'{surface}.theouthaven.com.'", 'Application DNS changes must remain limited to surface-specific theouthaven.com hostnames.');
requireText("'Type': 'A'", 'Cutover must use a Route 53 ALB alias A record.');
requireText("'AliasTarget'", 'Cutover must target the AWS load balancer with an alias record.');
requireText('EvaluateTargetHealth', 'Route 53 alias target health evaluation must remain enabled.');
requireText('Verify public DNS and HTTPS after cutover', 'Cutover must prove the public host serves the expected AWS runtime.');
requireText('Restore saved DNS automatically after failed cutover validation', 'Failed public validation must automatically restore the prior DNS state.');
requireText("failure() && inputs.operation == 'cutover' && steps.apply.outputs.changed == 'true'", 'Automatic rollback must only run after an actual failed cutover change.');
requireText('Restore last saved DNS snapshot', 'Operators must retain an explicit manual rollback path.');

forbid(/\npush:\s*(?:\n|$)/, 'Application traffic DNS workflow must never run from a push trigger.');
forbid(/schedule:/, 'Application traffic DNS workflow must never run on a schedule.');
forbid(/admin\.theouthaven\.com[^\n]*consumer|business\.theouthaven\.com[^\n]*consumer/i, 'Cutover workflow must not route consumer traffic.');
forbid(/["']Name["']\s*:\s*["']theouthaven\.com\.["']/, 'Cutover workflow must not construct an apex application DNS record.');
forbid(/["']Name["']\s*:\s*["']www\.theouthaven\.com\.["']/, 'Cutover workflow must not construct a www application DNS record.');
forbid(/aws\s+iam\s+(put-role-policy|delete-role-policy|attach-role-policy|detach-role-policy)/, 'DNS cutover must not mutate IAM policies at runtime.');
forbid(/TheOutHavenWebSurfaceDnsCutoverBootstrap/, 'DNS cutover must not reintroduce the temporary inline IAM bootstrap.');
forbid(/aws\s+ssm\s+(put-parameter|get-parameter)/, 'DNS cutover rollback storage must not depend on temporary SSM permissions.');

console.log('web-surfaces-dns-cutover-regression: PASS');
