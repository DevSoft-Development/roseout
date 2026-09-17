#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function classifyChangedFiles(files) {
  const any = (...patterns) => files.some((file) => patterns.some((pattern) => pattern.test(file)));

  const shared = any(
    /^package(?:-lock)?\.json$/,
    /^tsconfig(?:\..+)?\.json$/,
    /^next\.config\./,
    /^middleware\./,
    /^instrumentation\.ts$/,
    /^eslint\.config\./,
    /^postcss\.config\./,
    /^tailwind\.config\./,
    /^types\//,
    /^hooks\//,
    /^components\/(?!admin(?:\/|$)|reserve(?:\/|$)|locations?(?:\/|$)|business(?:\/|$))/,
    /^lib\/(?:auth|security|supabase|database|notifications|email|sms)(?:\/|$)/,
    /^\.github\/workflows\/production-ci\.yml$/,
    /^scripts\/ci-service-domains(?:\.test)?\.mjs$/,
  );

  const admin = shared || any(
    /^app\/admin(?:\/|$)/,
    /^app\/api\/admin(?:\/|$)/,
    /^components\/admin(?:\/|$)/,
    /^lib\/admin(?:\/|$)/,
  );

  const business = shared || any(
    /^app\/business(?:\/|$)/,
    /^app\/locations(?:\/|$)/,
    /^app\/api\/(?:business|locations|billing|stripe)(?:\/|$)/,
    /^components\/(?:business|locations?)(?:\/|$)/,
    /^lib\/(?:locations|billing|stripe)(?:\/|$)/,
    /^scripts\/(?:business-onboarding|billing-production-regression)\./,
  );

  const reserve = shared || any(
    /^app\/reserve(?:\/|$)/,
    /^app\/api\/reserve(?:\/|$)/,
    /^components\/reserve(?:\/|$)/,
    /^lib\/(?:reserve|reservations)(?:\/|$)/,
  );

  const workers = shared || any(
    /^app\/api\/admin\/workers(?:\/|$)/,
    /^infra\/aws\/background-runtime(?:\/|$)/,
    /^scripts\/worker-/,
    /^config\/cron-jobs\.json$/,
    /^\.github\/workflows\/aws-background-/,
  );

  const mobile = any(
    /^mobile(?:\/|$)/,
    /^app\/api\/mobile(?:\/|$)/,
    /^scripts\/mobile-/,
    /^\.github\/workflows\/mobile-/,
  );

  const infrastructure = any(
    /^infra\/aws(?:\/|$)/,
    /^\.github\/workflows\/aws-/,
  );

  const consumer = shared || any(
    /^app\/(?!admin(?:\/|$)|business(?:\/|$)|locations(?:\/|$)|reserve(?:\/|$))/,
    /^app\/api\/(?:generate|search|explore|outings|consumer)(?:\/|$)/,
    /^lib\/search(?:\/|$)/,
    /^lib\/searchIntent\.ts$/,
    /^public(?:\/|$)/,
  );

  const web = shared || admin || business || reserve || consumer || any(
    /^app(?:\/|$)/,
    /^components(?:\/|$)/,
    /^lib(?:\/|$)/,
    /^public(?:\/|$)/,
    /^config\/(?!cron-jobs\.json$)/,
  );

  const docsOnly = files.length > 0 && files.every((file) =>
    /^(?:docs\/|README\.md$|AGENTS\.md$|CLAUDE\.md$)/.test(file),
  );

  return {
    web,
    consumer,
    admin,
    business,
    reserve,
    workers,
    mobile,
    infrastructure,
    shared,
    docs_only: docsOnly,
    changed_count: files.length,
  };
}

function changedFilesBetween(baseSha, headSha) {
  const diff = execFileSync("git", ["diff", "--name-only", baseSha, headSha], {
    encoding: "utf8",
  }).trim();
  return diff ? diff.split("\n").filter(Boolean) : [];
}

function main() {
  const [baseSha, headSha] = process.argv.slice(2);
  if (!baseSha || !headSha) {
    console.error("Usage: node scripts/ci-service-domains.mjs <base-sha> <head-sha>");
    process.exit(2);
  }

  const files = changedFilesBetween(baseSha, headSha);
  const outputs = classifyChangedFiles(files);

  for (const [key, value] of Object.entries(outputs)) {
    process.stdout.write(`${key}=${String(value)}\n`);
  }
  process.stderr.write(`Changed files (${files.length}):\n${files.map((file) => `- ${file}`).join("\n")}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main();
}
