import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function hasPlaywright() {
  try {
    require.resolve("@playwright/test");
    return true;
  } catch {
    return false;
  }
}

if (!hasPlaywright()) {
  console.warn("");
  console.warn("Optional E2E skipped because @playwright/test is not installed.");
  console.warn("This is NOT a full production gate.");
  console.warn("The project is build-safe only, not production-verified.");
  console.warn("Run npm install, then run npm run production-check:strict before deploying.");
  console.warn("");
  process.exit(0);
}

const result = spawnSync("npx", ["playwright", "test"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: process.env,
});

process.exit(result.status ?? 1);
