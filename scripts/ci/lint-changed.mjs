#!/usr/bin/env node
// Lint modified source files for PRs; preserve full lint for configuration, tooling,
// or manual checks. Always fail closed if comparison scope cannot be established.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const root = process.cwd();
const base = process.env.BASE_SHA;
const head = process.env.HEAD_SHA || "HEAD";
const full = () => {
  console.log("Running full repository ESLint.");
  const result = spawnSync("npm", ["run", "lint"], { cwd: root, stdio: "inherit" });
  process.exit(result.status ?? 1);
};
if (process.env.FULL_LINT === "true" || !base || /^0+$/.test(base)) full();

const diff = spawnSync("git", ["diff", "--name-only", "--diff-filter=ACMR", "-z", base, head], {
  cwd: root, encoding: "utf8",
});
if (diff.status !== 0 || diff.error) full();
const changed = diff.stdout.split("\0").filter(Boolean);
const configuration = /^(eslint\.config\.|\.eslint|package(-lock)?\.json$|tsconfig|\.github\/workflows\/production-ci\.yml$|scripts\/ci\/lint-changed\.mjs$)/;
if (changed.some((file) => configuration.test(file))) full();
const files = changed.filter((file) => /\.(?:[cm]?[jt]sx?)$/.test(file) && existsSync(file));
if (!files.length) {
  console.log("No changed JS/TS files need ESLint.");
  process.exit(0);
}
console.log(`ESLint: checking ${files.length} changed JS/TS files.`);
const result = spawnSync("npx", ["--no-install", "eslint", ...files], {
  cwd: root, stdio: "inherit",
});
process.exit(result.status ?? 1);
