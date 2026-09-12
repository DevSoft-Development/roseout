import { readFileSync } from "node:fs";

const homepage = readFileSync("app/page.tsx", "utf8");
const homepageSearch = readFileSync("components/LiveOutingSearch.tsx", "utf8");

const requiredHomepageSnippets = [
  'export const revalidate = 300;',
  'Plan better <span className="text-[#e1062a]">OUTings.</span>',
  'New York City + Long Island',
  '<LiveOutingSearch />',
  'How it works',
  'One search. Your whole outing.',
  'See it in action',
  'Eat. Do. Go.',
  'Plan by occasion.',
  'Popular areas',
  'Your customers are already deciding where to go next.',
  'So, what are we doing?',
  'Plan My Outing',
];

const requiredSearchSnippets = [
  'Find My Outing',
  'Try describing the whole night — not just a restaurant.',
  'Dinner and something fun in Brooklyn tonight',
  'Sushi and karaoke near me',
  'Dinner + activity',
  'Near me',
  'homepage_outing_search',
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

const missingHomepage = requiredHomepageSnippets.filter((snippet) => !homepage.includes(snippet));
const missingSearch = requiredSearchSnippets.filter((snippet) => !homepageSearch.includes(snippet));
const combinedCustomerSurface = `${homepage}\n${homepageSearch}`.toLowerCase();
const forbidden = forbiddenSnippets.filter((snippet) => combinedCustomerSurface.includes(snippet.toLowerCase()));

if (missingHomepage.length > 0 || missingSearch.length > 0) {
  console.error("Homepage verification failed. Missing required search-first homepage elements:");
  for (const snippet of missingHomepage) {
    console.error(`- app/page.tsx: ${snippet}`);
  }
  for (const snippet of missingSearch) {
    console.error(`- components/LiveOutingSearch.tsx: ${snippet}`);
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
