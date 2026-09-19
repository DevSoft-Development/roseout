#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap((e)=>{
    const full=path.join(dir,e.name);
    return e.isDirectory()?walk(full):[full];
  });
}

const legacyUi=walk("app/reserve").filter((p)=>/\.(ts|tsx)$/.test(p));
if (legacyUi.length) {
  throw new Error(`Legacy root Reserve UI still exists:\n${legacyUi.join("\n")}`);
}

const proxy=fs.readFileSync("proxy.ts","utf8");
if (!proxy.includes('https://reserve.theouthaven.com${pathname}${search}')) {
  throw new Error("Root production proxy must redirect /reserve/** to the isolated Reserve host.");
}

for (const file of ["lib/reservation.ts","lib/routes.ts","lib/location-editor-links.ts"]) {
  const text=fs.readFileSync(file,"utf8");
  if (!text.includes("https://reserve.theouthaven.com")) {
    throw new Error(`${file} must point Reserve navigation to the isolated hostname.`);
  }
}

if (!fs.existsSync("apps/reserve/app/reserve/dashboard/page.tsx")) {
  throw new Error("Isolated Reserve dashboard ownership is missing.");
}

console.log("Reserve root UI ownership cleanup regression passed.");
