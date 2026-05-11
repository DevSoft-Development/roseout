import { readFileSync } from "node:fs";

const homepage = readFileSync("app/page.tsx", "utf8");

const requiredSnippets = [
  'export const dynamic = "force-dynamic";',
  'export const revalidate = 0;',
  'const HOMEPAGE_VERSION = "home-may-11-route-redesign-v3";',
  'May 11 live update • route-first homepage',
  'data-homepage-lock="2026-05-11"',
  'Build the full route, not just a list of places.',
  'restaurant anchors,',
  "Today\'s planning lanes",
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
