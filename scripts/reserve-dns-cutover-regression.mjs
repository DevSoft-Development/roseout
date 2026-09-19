#!/usr/bin/env node
import fs from "node:fs";
const w=fs.readFileSync(".github/workflows/aws-reserve-dns-cutover.yml","utf8");
for (const s of [
  "CUTOVER_RESERVE",
  "ROLLBACK_RESERVE",
  "theouthaven-reserve-web-foundation-production",
  "ReserveLoadBalancerDnsName",
  "reserve.theouthaven.com",
  ".provider == \"aws-reserve\"",
  "route53 change-resource-record-sets",
  "Automatic rollback after failed cutover validation"
]) {
  if (!w.includes(s)) throw new Error(`Missing Reserve DNS cutover contract: ${s}`);
}
if (w.includes("admin.theouthaven.com") || w.includes("business.theouthaven.com")) {
  throw new Error("Reserve DNS cutover must not modify Admin or Business hostnames.");
}
console.log("Reserve DNS cutover regression passed.");
