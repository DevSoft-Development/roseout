"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("node:assert/strict"));
const intent_1 = require("../lib/search/intent");
const geo_matching_1 = require("../lib/search/geo-matching");
const ranking_1 = require("../lib/search/ranking");
const cases = [
    "steak dinner and hookah in Queens",
    "steak dinner in Queens",
    "rooftop dinner in Manhattan",
    "hookah in Brooklyn",
    "brunch in Long Island City",
    "seafood dinner and hookah in Astoria",
    "brunch in Brooklyn",
    "romantic dinner in Manhattan",
    "bowling and dinner in Queens",
    "sip and paint after dinner",
    "rooftop lounge after dinner in Manhattan",
    "coffee date in Brooklyn",
    "dessert after dinner in Queens",
];
for (const query of cases) {
    const intent = (0, intent_1.parseCanonicalIntent)(query, { message: query });
    console.log(query, {
        foodIntent: intent.foodIntent,
        activityIntent: intent.activityIntent,
        locationIntent: intent.locationIntent,
        borough: intent.borough,
        city: intent.city,
        neighborhood: intent.neighborhood,
        needsRestaurant: intent.needsRestaurant,
        needsActivity: intent.needsActivity,
        wantsPairing: intent.wantsPairing,
        addOnIntent: intent.addOnIntent,
    });
}
const steakHookah = (0, intent_1.parseCanonicalIntent)("steak dinner and hookah in Queens");
assert.equal(steakHookah.needsRestaurant, true);
assert.equal(steakHookah.needsActivity, true);
assert.ok(steakHookah.foodIntent.includes("steak"));
assert.ok(steakHookah.activityIntent.includes("hookah"));
const steakQueens = (0, intent_1.parseCanonicalIntent)("steak dinner in Queens");
assert.equal(steakQueens.needsRestaurant, true);
assert.equal(steakQueens.needsActivity, false);
assert.equal(steakQueens.borough, "queens");
assert.ok(steakQueens.foodIntent.includes("steak"));
const rooftopManhattan = (0, intent_1.parseCanonicalIntent)("rooftop dinner in Manhattan");
assert.equal(rooftopManhattan.needsRestaurant, true);
assert.equal(rooftopManhattan.needsActivity, false);
assert.equal(rooftopManhattan.borough, "manhattan");
assert.ok(rooftopManhattan.vibes.includes("rooftop"));
const hookahBrooklyn = (0, intent_1.parseCanonicalIntent)("hookah in Brooklyn");
assert.equal(hookahBrooklyn.needsRestaurant, false);
assert.equal(hookahBrooklyn.needsActivity, true);
assert.equal(hookahBrooklyn.borough, "brooklyn");
assert.ok(hookahBrooklyn.activityIntent.includes("hookah"));
const brunchLic = (0, intent_1.parseCanonicalIntent)("brunch in Long Island City");
assert.equal(brunchLic.needsRestaurant, true);
assert.equal(brunchLic.needsActivity, false);
assert.equal(brunchLic.neighborhood, "long island city");
assert.equal(brunchLic.borough, "queens");
const brunchBrooklyn = (0, intent_1.parseCanonicalIntent)("brunch in Brooklyn");
assert.equal(brunchBrooklyn.needsRestaurant, true);
assert.equal(brunchBrooklyn.needsActivity, false);
const bowlingDinner = (0, intent_1.parseCanonicalIntent)("bowling and dinner in Queens");
assert.equal(bowlingDinner.needsRestaurant, true);
assert.equal(bowlingDinner.needsActivity, true);
assert.equal(bowlingDinner.wantsPairing, true);
const queensGeo = (0, geo_matching_1.detectRequestedGeo)("steak dinner in Queens");
assert.ok(queensGeo);
assert.ok((0, geo_matching_1.scoreGeoMatch)({ name: "Queens Steakhouse", borough: "Queens", city: "New York", state: "NY" }, queensGeo) >
    (0, geo_matching_1.scoreGeoMatch)({ name: "Brooklyn Steakhouse", borough: "Brooklyn", city: "New York", state: "NY" }, queensGeo), "Exact borough matches must outrank wrong borough matches.");
const licGeo = (0, geo_matching_1.detectRequestedGeo)("brunch in Long Island City");
assert.ok(licGeo);
assert.ok((0, geo_matching_1.scoreGeoMatch)({ name: "LIC Brunch", neighborhood: "Long Island City", borough: "Queens", city: "New York", state: "NY" }, licGeo) >
    (0, geo_matching_1.scoreGeoMatch)({ name: "Queens Brunch", neighborhood: "Astoria", borough: "Queens", city: "New York", state: "NY" }, licGeo), "Exact neighborhood matches must outrank same-borough fallback matches.");
const rankedSteak = (0, ranking_1.rankRestaurants)([
    { name: "Brooklyn Steakhouse", borough: "Brooklyn", city: "New York", state: "NY", restaurant_name: "Brooklyn Steakhouse", cuisine: "steakhouse", search_document: "steak dinner restaurant" },
    { name: "Queens Steakhouse", borough: "Queens", city: "New York", state: "NY", restaurant_name: "Queens Steakhouse", cuisine: "steakhouse", search_document: "steak dinner restaurant" },
    { name: "Queens Hookah", borough: "Queens", city: "New York", state: "NY", activity_name: "Queens Hookah", primary_category: "hookah lounge", search_document: "hookah lounge activity" },
], steakQueens);
assert.equal(rankedSteak[0].name, "Queens Steakhouse");
const rankedRooftop = (0, ranking_1.rankRestaurants)([
    { name: "Brooklyn Rooftop", borough: "Brooklyn", city: "New York", state: "NY", restaurant_name: "Brooklyn Rooftop", cuisine: "restaurant", search_document: "rooftop dinner terrace" },
    { name: "Manhattan Rooftop", borough: "Manhattan", city: "New York", state: "NY", restaurant_name: "Manhattan Rooftop", cuisine: "restaurant", search_document: "rooftop dinner skyline terrace" },
], rooftopManhattan);
assert.equal(rankedRooftop[0].name, "Manhattan Rooftop");
const rankedHookah = (0, ranking_1.rankActivities)([
    { name: "Queens Hookah", borough: "Queens", city: "New York", state: "NY", activity_name: "Queens Hookah", primary_category: "hookah lounge", search_document: "hookah lounge activity" },
    { name: "Brooklyn Hookah", borough: "Brooklyn", city: "New York", state: "NY", activity_name: "Brooklyn Hookah", primary_category: "hookah lounge", search_document: "hookah lounge activity" },
], hookahBrooklyn);
assert.equal(rankedHookah[0].name, "Brooklyn Hookah");
console.log("search-production-readiness regression passed");
