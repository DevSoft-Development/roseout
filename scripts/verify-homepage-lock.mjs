import { readFileSync } from "node:fs";

const homepage = readFileSync("app/page.tsx", "utf8");

const requiredSnippets = [
  'export const dynamic = "force-dynamic";',
  'export const revalidate = 0;',
  'const HOMEPAGE_VERSION = "home-route-first-redesign-v4";',
  'Route-first outing planner',
  'data-homepage-lock="2026-05-11"',
  'Build the full route, not just a list of places.',
  'restaurant anchors,',
  "Planning lanes",
  'Choose the lane. We connect the stops.',
  'Try this idea →',
  'Food, drinks, activities, shows, dessert, or group-friendly plans',
  'User feedback',
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
