#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const surfaces = ["consumer", "admin", "business"];

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

for (const surface of surfaces) {
  const appRoot = path.join(root, "apps", surface);
  for (const required of ["app", "next.config.ts", "tsconfig.json"]) {
    if (!fs.existsSync(path.join(appRoot, required))) {
      throw new Error(`Missing ${surface} surface file: ${required}`);
    }
  }

  const tsconfig = read(`apps/${surface}/tsconfig.json`);
  if (!tsconfig.includes('"@/*": ["./*"]')) {
    throw new Error(`${surface} must resolve @/* inside its own app boundary.`);
  }

  const sourceFiles = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) sourceFiles.push(full);
    }
  };
  walk(path.join(appRoot, "app"));

  for (const file of sourceFiles) {
    const source = fs.readFileSync(file, "utf8");
    if (/from\s+["']\.\.\/\.\.\/\.\.\/(app|components|lib)\//.test(source)) {
      throw new Error(`${surface} app may not import the root monolith directly: ${path.relative(root, file)}`);
    }
  }
}

const pkg = JSON.parse(read("package.json"));
for (const surface of surfaces) {
  const key = `build:surface:${surface}`;
  if (pkg.scripts?.[key] !== `next build apps/${surface}`) {
    throw new Error(`Missing independent build script: ${key}`);
  }
}

console.log("Surface app isolation foundation regression passed.");
