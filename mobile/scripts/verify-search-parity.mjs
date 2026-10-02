import fs from "node:fs";

const home = fs.readFileSync("app/(tabs)/index.tsx", "utf8");
const plan = fs.readFileSync("app/(tabs)/plan.tsx", "utf8");
const explore = fs.readFileSync("app/(tabs)/explore.tsx", "utf8");

for (const [name, source] of [
  ["home", home],
  ["plan", plan],
  ["explore", explore],
]) {
  if (!source.includes("resolvedPlanType")) {
    throw new Error(`${name} must consume canonical resolvedPlanType`);
  }
}

if (home.includes('planType: "outing"')) {
  throw new Error("Home must not hard-code outing mode for natural-language search");
}
if (explore.includes('planType: "outing"')) {
  throw new Error("Explore must not hard-code outing mode for natural-language search");
}

console.log("mobile web search parity verification passed");
