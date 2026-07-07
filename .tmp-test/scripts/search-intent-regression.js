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
const searchIntent_1 = require("../lib/searchIntent");
const cases = [
    { q: "steak dinner and hookah lounge in Queens", check: (i) => { assert.equal(i.wantsRestaurant, true); assert.equal(i.wantsActivity, true); assert.ok((0, searchIntent_1.buildRestaurantSearchInput)(i).includes("steak")); assert.ok((0, searchIntent_1.buildActivitySearchInput)(i).includes("hookah")); assert.equal(i.hardFilters.borough, "Queens"); } },
    { q: "seafood dinner and hookah in Queens", check: (i) => { assert.equal(i.wantsRestaurant, true); assert.equal(i.wantsActivity, true); } },
    { q: "dinner and dessert in Queens", check: (i) => { assert.equal(i.wantsRestaurant, true); assert.equal(i.wantsActivity, true); assert.ok((0, searchIntent_1.buildActivitySearchInput)(i).includes("dessert")); } },
    { q: "restaurant and bowling in Brooklyn", check: (i) => { assert.equal(i.wantsRestaurant, true); assert.equal(i.wantsActivity, true); assert.ok((0, searchIntent_1.buildActivitySearchInput)(i).includes("bowling")); } },
    { q: "brunch and rooftop lounge in Manhattan", check: (i) => { assert.equal(i.wantsRestaurant, true); assert.equal(i.wantsActivity, true); } },
    { q: "hookah lounge only in Queens", check: (i) => { assert.equal(i.wantsRestaurant, false); assert.equal(i.wantsActivity, true); } },
    { q: "Steak restaurant in Queens", check: (i) => { assert.equal(i.wantsRestaurant, true); assert.equal(i.wantsActivity, false); } },
    { q: "things to do in Queens", check: (i) => { assert.equal(i.wantsRestaurant, false); assert.equal(i.wantsActivity, true); } },
    { q: "romantic rooftop dinner in Manhattan", check: (i) => { assert.equal(i.needsRestaurant, true); assert.equal(i.needsActivity, false); assert.equal(i.wantsPairing, false); assert.equal(i.activityIntents.includes("rooftop"), false); assert.ok(i.vibes.includes("rooftop")); assert.ok((0, searchIntent_1.buildRestaurantSearchInput)(i).includes("rooftop")); assert.equal((0, searchIntent_1.buildActivitySearchInput)(i).includes("rooftop"), false); assert.equal(i.hardFilters.borough, "Manhattan"); } },
    { q: "steak dinner in Queens", check: (i) => { assert.equal(i.needsRestaurant, true); assert.equal(i.needsActivity, false); assert.equal(i.hardFilters.borough, "Queens"); } },
    { q: "hookah lounge in Queens", check: (i) => { assert.equal(i.needsRestaurant, false); assert.equal(i.needsActivity, true); assert.equal(i.hardFilters.borough, "Queens"); } },
    { q: "seafood dinner in Brooklyn", check: (i) => { assert.equal(i.needsRestaurant, true); assert.equal(i.needsActivity, false); assert.equal(i.hardFilters.borough, "Brooklyn"); } },
    { q: "rooftop bar in Manhattan", check: (i) => { assert.ok(i.activityIntents.includes("rooftop")); assert.equal(i.needsActivity, true); assert.equal(i.hardFilters.borough, "Manhattan"); assert.ok((0, searchIntent_1.buildActivitySearchInput)(i).includes("rooftop")); } },
    { q: "Mediterranean Dinner with hookah in Manhattan", check: (i) => { assert.equal(i.sameVenuePreferred, true); assert.equal(i.sequenceDetected, false); assert.equal(i.proximityDetected, false); assert.equal(i.needsRestaurant, true); assert.equal(i.needsActivity, false); assert.equal(i.wantsPairing, false); assert.equal(i.primaryDomain, "restaurant"); assert.ok((0, searchIntent_1.buildRestaurantSearchInput)(i).includes("hookah")); assert.ok((0, searchIntent_1.buildRestaurantSearchInput)(i).includes("mediterranean")); } },
    { q: "restaurant with live music", check: (i) => { assert.equal(i.sameVenuePreferred, true); assert.equal(i.needsRestaurant, true); assert.equal(i.needsActivity, false); assert.ok((0, searchIntent_1.buildRestaurantSearchInput)(i).includes("live music")); } },
    { q: "dinner with rooftop views", check: (i) => { assert.equal(i.sameVenuePreferred, true); assert.equal(i.needsRestaurant, true); assert.equal(i.wantsPairing, false); } },
    { q: "brunch with bottomless mimosas", check: (i) => { assert.equal(i.sameVenuePreferred, true); assert.equal(i.needsRestaurant, true); assert.ok((0, searchIntent_1.buildRestaurantSearchInput)(i).includes("mimosas")); } },
    { q: "coffee shop with outdoor seating", check: (i) => { assert.equal(i.sameVenuePreferred, true); assert.ok((0, searchIntent_1.buildRestaurantSearchInput)(i).includes("outdoor")); } },
    { q: "bar with games", check: (i) => { assert.equal(i.sameVenuePreferred, true); assert.equal(i.wantsPairing, false); } },
    { q: "activity with drinks", check: (i) => { assert.equal(i.sameVenuePreferred, true); assert.equal(i.needsActivity, true); assert.equal(i.wantsPairing, false); assert.ok((0, searchIntent_1.buildActivitySearchInput)(i).includes("drinks")); } },
    { q: "hookah lounge with food near me", check: (i) => { assert.equal(i.sameVenuePreferred, true); assert.equal(i.proximityDetected, false); assert.equal(i.wantsPairing, false); } },
    { q: "restaurant with live music near me", check: (i) => { assert.equal(i.sameVenuePreferred, true); assert.equal(i.proximityDetected, false); assert.equal(i.needsActivity, false); } },
    { q: "Mediterranean dinner and hookah after in Manhattan", check: (i) => { assert.equal(i.sameVenuePreferred, false); assert.equal(i.sequenceDetected, true); assert.equal(i.needsRestaurant, true); assert.equal(i.needsActivity, true); assert.equal(i.primaryDomain, "mixed"); } },
    { q: "dinner then hookah in Queens", check: (i) => { assert.equal(i.sequenceDetected, true); assert.equal(i.needsRestaurant, true); assert.equal(i.needsActivity, true); } },
    { q: "dinner followed by hookah", check: (i) => { assert.equal(i.sequenceDetected, true); assert.equal(i.primaryDomain, "mixed"); } },
    { q: "dinner near a hookah lounge", check: (i) => { assert.equal(i.proximityDetected, true); assert.equal(i.primaryDomain, "mixed"); } },
    { q: "restaurant near live music", check: (i) => { assert.equal(i.proximityDetected, true); assert.equal(i.sameVenuePreferred, false); } },
];
for (const c of cases)
    c.check((0, searchIntent_1.parseSearchIntent)(c.q, {}));
console.log("search intent regression checks passed");
