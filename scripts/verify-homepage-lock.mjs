import { readFileSync } from "node:fs";

const homepage = readFileSync("app/page.tsx", "utf8");

const requiredSnippets = [
  'export const dynamic = "force-dynamic";',
  'export const revalidate = 0;',
  'const HOMEPAGE_VERSION = "home-clean-conversion-redesign-2026-05-11-locked-v2";',
  'Fresh May 11 update • Locked homepage',
  'data-homepage-lock="2026-05-11"',
  'Plan a better night out without the tab overload.',
  'TheOutHaven turns one vibe into a clean restaurant, activity,',
  'Featured date ideas',
  'Choose the lane. We connect the stops.',
  'Try this idea →',
  'Food, drinks, activities, shows, dessert, or group-friendly plans',
  'Early users want fewer tabs and faster decisions.',
];

const missing = requiredSnippets.filter((snippet) => !homepage.includes(snippet));

if (missing.length > 0) {
  console.error("Homepage lock verification failed. Missing required homepage update snippets:");
  for (const snippet of missing) {
    console.error(`- ${snippet}`);
  }
  process.exit(1);
}

console.log("Homepage lock verification passed.");
