import { readFileSync, existsSync } from "node:fs";

const checks = [
  ["app/robots.ts", "disallow: [", "robots has disallow rules"],
  ["app/sitemap.ts", "MAX_LOCATION_URLS", "sitemap limits location URLs"],
  ["app/sitemap.ts", ".eq(\"is_searchable\", true)", "sitemap filters searchable locations"],
  ["app/sitemap.ts", ".not(\"is_hidden\"", "sitemap excludes hidden locations"],
  ["app/layout.tsx", "metadataBase", "global metadataBase exists"],
  ["app/layout.tsx", "application/ld+json", "global structured data exists"],
  ["lib/seo.ts", "shouldNoIndex", "SEO noindex helper exists"],
  ["app/locations/[type]/[id]/layout.tsx", "canonicalUrl", "location metadata uses canonical helper"],
  ["app/locations/[type]/[id]/layout.tsx", "LocalBusiness", "location structured data exists"],
  ["app/admin/layout.tsx", "noIndexRobots", "admin is noindex"],
  ["app/dashboard/layout.tsx", "noIndex", "dashboard is noindex"],
  ["app/explore/[slug]/page.tsx", "LANDING_PAGES", "local SEO landing pages exist"],
];

let failed = false;
for (const [file, needle, label] of checks) {
  if (!existsSync(file)) {
    console.error(`FAIL ${label}: missing ${file}`);
    failed = true;
    continue;
  }

  const content = readFileSync(file, "utf8");
  if (!content.includes(needle)) {
    console.error(`FAIL ${label}: ${file} does not include ${needle}`);
    failed = true;
  } else {
    console.log(`PASS ${label}`);
  }
}

if (failed) process.exit(1);
