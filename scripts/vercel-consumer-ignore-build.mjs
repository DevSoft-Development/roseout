import { execFileSync } from "node:child_process";

const SAFE_SKIP_PREFIXES = [
  ".github/",
  "apps/admin/",
  "apps/business/",
  "apps/reserve/",
  "docs/",
  "infra/",
];

const SAFE_SKIP_FILES = new Set([
  "AGENTS.md",
  "CLAUDE.md",
  "README.md",
]);

function changedFiles() {
  try {
    const output = execFileSync(
      "git",
      ["diff", "--name-only", "HEAD^", "HEAD"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return output
      .split("\n")
      .map((file) => file.trim())
      .filter(Boolean);
  } catch {
    return null;
  }
}

function canSkip(file) {
  if (SAFE_SKIP_FILES.has(file)) return true;
  return SAFE_SKIP_PREFIXES.some((prefix) => file.startsWith(prefix));
}

if (process.env.VERCEL_FORCE_BUILD === "1") {
  console.log("Vercel build required: VERCEL_FORCE_BUILD=1.");
  process.exit(1);
}

const files = changedFiles();

if (!files || files.length === 0) {
  console.log("Vercel build required: unable to determine changed files safely.");
  process.exit(1);
}

const unsafe = files.filter((file) => !canSkip(file));

if (unsafe.length > 0) {
  console.log("Vercel build required. Consumer-impacting or unknown files changed:");
  for (const file of unsafe) console.log(`- ${file}`);
  process.exit(1);
}

console.log("Skipping Vercel build. Only non-consumer files changed:");
for (const file of files) console.log(`- ${file}`);
process.exit(0);
