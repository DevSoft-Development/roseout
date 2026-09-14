import fs from "node:fs";

const source = fs.readFileSync("app/api/mobile/v1/search/route.ts", "utf8");

if (!source.includes('return planType === "restaurant" ? "restaurant" : planType === "activity" ? "activity" : "auto";')) {
  throw new Error("Mobile search must default to selectedSearchLane=auto");
}
if (source.includes('"restaurant and activity outing"')) {
  throw new Error("Mobile search must not force restaurant+activity wording for default searches");
}
if (!source.includes('selectedSearchLane: laneFor(body.planType)')) {
  throw new Error("Mobile search must continue routing through the canonical search controller");
}
if (!source.includes('import { handleGeneratePost } from "@/lib/search/public-api/controller";')) {
  throw new Error("Mobile search must use the canonical public search controller");
}

console.log("Mobile/web search parity regression checks passed.");
