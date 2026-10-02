#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const selfTest = args.includes("--self-test");

const nativeExact = new Set([
  "mobile/app.json",
  "mobile/ota.config.json",
  "mobile/package.json",
  "mobile/package-lock.json",
  "mobile/metro.config.js",
  "mobile/tsconfig.json",
  "mobile/app.config.js",
  "mobile/app.config.ts",
  "mobile/eas.json",
  "azure-pipelines-mobile.yml",
]);

const nativePrefixes = [
  "mobile/ios/",
  "mobile/android/",
  "mobile/plugins/",
  "mobile/.eas/",
  "mobile/scripts/",
];

const nativeAssetExact = new Set([
  "mobile/assets/app-icon.png",
  "mobile/assets/adaptive-icon-foreground.png",
]);

function isDocumentationOnly(file) {
  return (
    /^mobile\/[^/]+\.md$/i.test(file) ||
    file === "mobile/.env.example" ||
    file === "mobile/.gitignore"
  );
}

function classify(files) {
  const changed = [...new Set(files.filter(Boolean))].sort();
  const mobileFiles = changed.filter((file) => file.startsWith("mobile/"));
  const runtimeFiles = mobileFiles.filter((file) => !isDocumentationOnly(file));

  if (!runtimeFiles.length && !changed.includes("azure-pipelines-mobile.yml")) {
    return { classification: "none", reasons: ["no mobile runtime changes"], changed };
  }

  const native = changed.filter(
    (file) =>
      nativeExact.has(file) ||
      nativeAssetExact.has(file) ||
      nativePrefixes.some((prefix) => file.startsWith(prefix)),
  );

  return {
    classification: "native",
    reasons: runtimeFiles.map((file) =>
      native.includes(file)
        ? `native-sensitive: ${file}`
        : `embedded-first policy: ${file} requires a native release`,
    ),
    changed,
  };
}

function assertCase(name, files, expected) {
  const actual = classify(files).classification;
  if (actual !== expected) {
    throw new Error(`${name}: expected ${expected}, got ${actual}`);
  }
}

if (selfTest) {
  assertCase("screen change", ["mobile/app/index.tsx"], "native");
  assertCase("component change", ["mobile/components/Card.tsx"], "native");
  assertCase("runtime asset", ["mobile/assets/hero.png"], "native");
  assertCase("native config", ["mobile/app.json"], "native");
  assertCase("dependency change", ["mobile/package.json"], "native");
  assertCase("lockfile change", ["mobile/package-lock.json"], "native");
  assertCase("runtime contract", ["mobile/ota.config.json"], "native");
  assertCase("icon change", ["mobile/assets/app-icon.png"], "native");
  assertCase("generated ios", ["mobile/ios/Podfile"], "native");
  assertCase("pipeline change", ["azure-pipelines-mobile.yml"], "native");
  assertCase("ambiguous mobile config", ["mobile/babel.config.js"], "native");
  assertCase("docs only", ["mobile/README.md"], "none");
  assertCase("backend-only change", ["lib/mobile/push.ts"], "none");
  console.log("Mobile release classifier self-test passed.");
  process.exit(0);
}

let base = process.env.BASE_SHA || "";
let head = process.env.HEAD_SHA || "HEAD";

for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--base") base = args[i + 1] || base;
  if (args[i] === "--head") head = args[i + 1] || head;
}

if (!base) {
  throw new Error("BASE_SHA or --base is required");
}

const output = execFileSync("git", ["diff", "--name-only", base, head], { encoding: "utf8" });
const result = classify(output.split(/\r?\n/));

console.log(JSON.stringify(result, null, 2));

if (process.env.GITHUB_OUTPUT) {
  const fs = await import("node:fs");
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `classification=${result.classification}\n`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed_count=${result.changed.length}\n`);
}
