import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const paths = [
  "app/locations/[type]/[locationId]/page.tsx",
  "apps/consumer/app/locations/[type]/[locationId]/page.tsx",
];

for (const relative of paths) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  for (const expected of [
    "Verified by TheOutHaven",
    "Owner claimed",
    "last_quality_check_at",
    'href="/trust"',
    "isVerifiedBusiness",
  ]) {
    if (!source.includes(expected)) {
      throw new Error(`${relative} is missing trust marker: ${expected}`);
    }
  }
}

console.log("Public location trust status regression checks passed.");
