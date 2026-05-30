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
  console.error("");
  console.error("Playwright is not installed.");
  console.error("Strict production checks cannot pass without real E2E tests.");
  console.error("");
  console.error("Install dependencies with:");
  console.error("npm install");
  console.error("");
  console.error("Then install Playwright browsers with:");
  console.error("npx playwright install");
  console.error("");
  console.error("If your registry blocks playwright-core with a 403 error, check:");
  console.error("npm config get registry");
  console.error("npm whoami");
  console.error("npm config list");
  console.error("");
  console.error("Expected registry:");
  console.error("https://registry.npmjs.org/");
  console.error("");
  process.exit(1);
}

const result = spawnSync("npx", ["playwright", "test"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: process.env,
});

process.exit(result.status ?? 1);
