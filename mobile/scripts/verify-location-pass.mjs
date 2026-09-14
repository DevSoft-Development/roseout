import fs from "node:fs";

const home = fs.readFileSync("app/(tabs)/index.tsx", "utf8");
const plan = fs.readFileSync("app/(tabs)/plan.tsx", "utf8");

if (!home.includes('mobileApi<PlannerIntentResponse>("/search/intent"')) {
  throw new Error("Home must resolve location before opening Step 2");
}
if (!home.includes('area: detectedArea') || !home.includes('areaSource: detectedArea ? "search" : "default"')) {
  throw new Error("Home must pass detected area and source into Step 2 navigation");
}
if (!plan.includes('const hasPassedArea = Boolean(incomingArea) && incomingAreaSource !== "default";')) {
  throw new Error("Step 2 must recognize a location passed from the initial search");
}
if (!plan.includes('if (hasPassedArea) {')) {
  throw new Error("Step 2 must prefer the passed location before calling intent parsing again");
}
if (!plan.includes('area: hasPassedArea ? incomingArea : DEFAULT_MOBILE_SEARCH_DRAFT.area')) {
  throw new Error("Step 2 draft must initialize from the passed location");
}

console.log("Mobile initial-search location pass-through verified.");
