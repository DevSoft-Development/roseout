#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const cssRoot = process.argv[2] || "apps/admin/.next/static/css";

if (!fs.existsSync(cssRoot)) {
  throw new Error(`Admin CSS output directory does not exist: ${cssRoot}`);
}

const files = fs.readdirSync(cssRoot)
  .filter((name) => name.endsWith(".css"))
  .map((name) => path.join(cssRoot, name));

if (!files.length) {
  throw new Error(`Admin build did not emit CSS files under ${cssRoot}`);
}

const css = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");

const requiredUtilities = [
  ".min-w-0",
  ".grid",
  ".px-4",
  ".py-6",
  ".shadow-xl",
  ".rounded-\\[18px\\]",
];

const missing = requiredUtilities.filter((marker) => !css.includes(marker));

if (missing.length) {
  throw new Error(
    "Admin Tailwind bundle is missing shared design-system utilities: " +
      missing.join(", "),
  );
}

console.log(
  `Admin CSS bundle contains shared design-system utilities across ${files.length} CSS file(s).`,
);
