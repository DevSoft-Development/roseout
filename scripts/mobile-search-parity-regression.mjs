import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const apiSource = fs.readFileSync(path.join(repoRoot, "app/api/mobile/v1/search/route.ts"), "utf8");
const resultsSource = fs.readFileSync(path.join(repoRoot, "mobile/app/(tabs)/results.tsx"), "utf8");
const typesSource = fs.readFileSync(path.join(repoRoot, "mobile/lib/search-results.ts"), "utf8");

if (!apiSource.includes('return planType === "restaurant" ? "restaurant" : planType === "activity" ? "activity" : "auto";')) {
  throw new Error("Mobile search must default to selectedSearchLane=auto");
}
if (apiSource.includes('"restaurant and activity outing"')) {
  throw new Error("Mobile search must not force restaurant+activity wording for default searches");
}
if (!apiSource.includes('selectedSearchLane: laneFor(body.planType)')) {
  throw new Error("Mobile search must continue routing through the canonical search controller");
}
if (!apiSource.includes('import { handleGeneratePost } from "@/lib/search/public-api/controller";')) {
  throw new Error("Mobile search must use the canonical public search controller");
}
if (!apiSource.includes("resolvedPlanType") || !apiSource.includes("canonicalSearchType")) {
  throw new Error("Mobile API must expose the canonical resolved result type");
}
if (!resultsSource.includes("const effectivePlanType: PlanType = result?.resolvedPlanType || planType;")) {
  throw new Error("Native results must render from the canonical resolved result type");
}
if (!resultsSource.includes('effectivePlanType === "outing" ? recommended.length > 0 : singles.length > 0')) {
  throw new Error("Native no-results state must use the canonical resolved result type");
}
if (!typesSource.includes('resolvedPlanType: MobileResolvedPlanType;')) {
  throw new Error("Mobile search response contract must include resolvedPlanType");
}

console.log("Mobile/web search parity regression checks passed.");
