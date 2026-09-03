import { readFileSync } from "node:fs";

const homepage = readFileSync("app/page.tsx", "utf8");

const requiredSnippets = [
  'export const revalidate = 300;',
  'Plan the whole outing.',
  'In one place.',
  'New York City + Long Island',
  'href="#plan-your-outing"',
  'Plan an Outing',
  'Explore Places',
  'Less searching. More deciding.',
  'Made for real plans',
  'Find places worth building a plan around.',
  'Be part of where people decide to go next.',
];

const forbiddenSnippets = [
  'Live product',
  'real planner',
  'reviewer signing',
  'public planner',
  'prelaunch',
  'join waitlist',
  'limited read-only preview',
];

const missing = requiredSnippets.filter((snippet) => !homepage.includes(snippet));
const forbidden = forbiddenSnippets.filter((snippet) => homepage.toLowerCase().includes(snippet.toLowerCase()));

if (missing.length > 0) {
  console.error("Homepage verification failed. Missing required premium homepage elements:");
  for (const snippet of missing) {
    console.error(`- ${snippet}`);
  }
  process.exit(1);
}

if (forbidden.length > 0) {
  console.error("Homepage verification failed. Customer-facing homepage contains retired launch or reviewer language:");
  for (const snippet of forbidden) {
    console.error(`- ${snippet}`);
  }
  process.exit(1);
}

console.log("Homepage verification passed.");
