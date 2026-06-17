#!/usr/bin/env tsx
import { MARKET_KEYS, getMarketAliases, getMarketDisplayName, inferMarketFromCityStateCounty, type MarketKey } from "../lib/location-markets";

const TARGETS: Partial<Record<MarketKey, string[]>> = {
  LONG_ISLAND: ["Garden City", "Mineola", "Westbury", "Great Neck", "Roslyn", "Manhasset", "Rockville Centre", "Freeport", "Hempstead", "Uniondale", "Long Beach", "Valley Stream", "Huntington", "Farmingdale", "Babylon", "Bay Shore", "Deer Park", "Melville", "Commack", "Patchogue", "Smithtown"],
  NORTHERN_NJ: ["Jersey City", "Hoboken", "Edgewater", "Fort Lee", "Englewood", "Teaneck", "Hackensack", "Montclair", "Newark", "Elizabeth", "Union", "West Orange", "Paramus", "Clifton"],
  WESTCHESTER: ["Yonkers", "New Rochelle", "White Plains", "Mount Vernon", "Bronxville", "Tarrytown"],
  STATEN_ISLAND: ["St. George", "Stapleton", "New Dorp", "Tottenville"],
  BRONX_OUTER: ["City Island", "Fordham", "Mott Haven", "Riverdale", "Pelham Bay", "Throgs Neck"],
};

const RESTAURANT_CATEGORIES = ["seafood", "steakhouse", "Italian", "Mexican", "Caribbean", "soul food", "brunch", "rooftop", "waterfront", "romantic restaurant", "lounge", "hookah", "bar and grill", "sushi", "halal", "Mediterranean", "Asian fusion", "dessert", "cafe", "coffee shop"];
const ACTIVITY_CATEGORIES = ["bowling", "comedy club", "jazz club", "museum", "arcade", "escape room", "movie theater", "live music", "lounge", "rooftop bar", "wine bar", "karaoke", "paint and sip", "axe throwing", "mini golf", "waterfront activity", "dessert", "coffee shop", "speakeasy"];

function arg(name: string) { const prefix = `--${name}=`; return process.argv.find((v) => v.startsWith(prefix))?.slice(prefix.length); }
function has(name: string) { return process.argv.includes(`--${name}`); }

async function main() {
  const dryRun = has("dry-run") || !has("execute");
  const market = (arg("market") || "LONG_ISLAND") as MarketKey;
  if (!MARKET_KEYS.includes(market)) throw new Error(`Unsupported market: ${market}`);
  const cityFilter = arg("city");
  const categoryFilter = arg("category");
  const categoryType = arg("type") || "all";
  const cities = (TARGETS[market] || []).filter((city) => !cityFilter || city.toLowerCase() === cityFilter.toLowerCase());
  const categories = [
    ...(categoryType !== "activities" ? RESTAURANT_CATEGORIES.map((category) => ({ category, location_type: "restaurants" })) : []),
    ...(categoryType !== "restaurants" ? ACTIVITY_CATEGORIES.map((category) => ({ category, location_type: "activities" })) : []),
  ].filter((row) => !categoryFilter || row.category.toLowerCase() === categoryFilter.toLowerCase());

  const planned = cities.flatMap((city) => categories.map((cat) => ({ city, state: market === "NORTHERN_NJ" ? "NJ" : "NY", market, source_market: market, ...cat })));
  console.log(JSON.stringify({ mode: dryRun ? "dry-run" : "execute", market, displayName: getMarketDisplayName(market), aliases: getMarketAliases(market), plannedSearches: planned.length, sample: planned.slice(0, 10) }, null, 2));

  if (!dryRun) {
    console.log("No direct fake venue insertion is performed. Connect this plan to the existing Google enrichment pipeline, then upsert real Google Places by google_place_id or normalized name+address+city+state.");
  }
}
main().catch((error) => { console.error(error); process.exit(1); });
