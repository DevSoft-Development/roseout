import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
}
function requireText(source, value, message) {
  if (!source.includes(value)) throw new Error(message);
}

const helper = read("lib/marketing/location-demand-insights.ts");
const studio = read("apps/business/app/locations/dashboard/marketing-studio/page.tsx");
const publisher = read("components/marketing/LocationInstagramPublisher.tsx");
const businessGenerate = read("apps/business/app/api/business/marketing/generate/route.ts");
const rootGenerate = read("app/api/business/marketing/generate/route.ts");

requireText(helper, '.eq("search_core_version", "v2")', "Demand insights must be sourced from Search V2.");
requireText(helper, 'row.searches30d >= 3', "Demand insights must enforce an aggregation privacy threshold.");
requireText(helper, '.from("location_ml_features")', "Marketing Studio demand must include canonical location search performance.");
requireText(helper, 'zip_code', "Demand insights must honor canonical ZIP geography.");
requireText(helper, 'resolved_market', "Demand insights must support market geography.");

requireText(studio, "Live Search V2 demand", "Marketing Studio must visibly surface Search V2 demand.");
requireText(studio, "demandOpportunities", "Marketing Studio must feed live demand into the publisher.");
requireText(publisher, "Build from live demand", "Publisher must let owners select a live demand angle.");
requireText(publisher, "demandQuery", "Selected demand must be submitted to marketing generation.");

for (const source of [businessGenerate, rootGenerate]) {
  requireText(source, "getLocationSearchV2DemandInsights", "Marketing generation must revalidate demand server-side.");
  requireText(source, "searchV2Demand: verifiedDemand", "Verified demand must be persisted with generation inputs.");
  requireText(source, 'demand_source: verifiedDemand ? "search_v2" : "static_profile"', "Generation metadata must preserve the demand source.");
  if (source.includes("actively searching TheOutHaven")) {
    throw new Error("Generated consumer copy must not expose internal demand telemetry.");
  }
}

if (businessGenerate !== rootGenerate) throw new Error("Root and isolated Business marketing generation routes must remain identical.");

console.log("Marketing Studio Search V2 demand regression checks passed.");
