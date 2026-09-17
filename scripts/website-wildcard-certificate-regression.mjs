#!/usr/bin/env node

import fs from 'node:fs';

const path = '.github/workflows/aws-website-wildcard-certificate.yml';
const source = fs.readFileSync(path, 'utf8');

function requireText(text, message) {
  if (!source.includes(text)) throw new Error(message || `Missing wildcard certificate contract: ${text}`);
}

requireText("CERTIFICATE_DOMAIN: '*.theouthaven.com'", 'Wildcard certificate domain must remain scoped to TheOutHaven.');
requireText('ROOT_DOMAIN: theouthaven.com', 'Route 53 lookup must remain scoped to theouthaven.com.');
requireText('route53:ChangeResourceRecordSets', 'Workflow must be able to publish the ACM validation CNAME.');
requireText('Publish only ACM validation CNAME', 'Workflow must keep the DNS mutation explicitly limited to ACM validation.');
requireText('_*.theouthaven.com', 'ACM validation record name must be constrained to an underscored TheOutHaven subdomain.');
requireText('_*.acm-validations.aws', 'ACM validation target must be constrained to AWS ACM validation.');
requireText('Type:"CNAME"', 'ACM DNS validation must remain a CNAME record.');
requireText('Application traffic DNS records changed: `NO`', 'Workflow summary must state that application traffic DNS is untouched.');
requireText('if [ "$STATUS" = "ISSUED" ]; then', 'Workflow must wait for the wildcard certificate to become ISSUED.');

if (/admin\.theouthaven\.com[^\n]*change-resource-record-sets|business\.theouthaven\.com[^\n]*change-resource-record-sets/i.test(source)) {
  throw new Error('Wildcard certificate workflow must not change Admin or Business application traffic records.');
}

if (/Type:\s*"?(A|AAAA)"?/i.test(source)) {
  throw new Error('Wildcard certificate workflow must not create application traffic A/AAAA records.');
}

console.log('website-wildcard-certificate-regression: PASS');
