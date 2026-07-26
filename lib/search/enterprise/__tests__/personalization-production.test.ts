import { describe, expect, it } from "vitest";
import { buildUserPreferenceProfile } from "../personalization";
import { loadUserPreferenceProfile } from "../personalizationProfileLoader";
import { rerankLocations } from "../phaseTwoRanking";
import type { SearchIntent } from "../types";

const broadIntent = {
  rawQuery: "dinner",
  searchType: "restaurant",
  primaryDomain: "restaurant",
  needsRestaurant: true,
  needsActivity: false,
  wantsPairing: false,
  restaurantIntent: { cuisineTerms: [], mealTerms: [], foodTerms: [], categoryTerms: [], vibeTerms: [], featureTerms: [], negativeTerms: [] },
  activityIntent: { activityTerms: [], categoryTerms: [], vibeTerms: [], featureTerms: [], negativeTerms: [] },
  geo: { aliases: [], geoStrictness: "none" },
  vibe: [],
  strictness: "medium",
} as unknown as SearchIntent;

const items = [
  { id: "thai", name: "Thai", cuisine: "thai", score: 1 },
  { id: "italian", name: "Italian", cuisine: "italian", score: 0 },
] as any;
const profile = buildUserPreferenceProfile("private-user", [
  { userId: "private-user", type: "completed", occurredAt: new Date().toISOString(), cuisine: "italian" },
]);

describe("production personalization controls", () => {
  it("calculates in shadow without reordering, and applies bounded enabled ordering", () => {
    const shadow = rerankLocations(items, broadIntent, { mode: "enabled", personalization: "shadow", profile });
    expect(shadow.results[0].id).toBe("thai");
    expect(shadow.shadowResults[0].id).toBe("italian");
    expect(shadow.personalization).toEqual({ adjustmentCount: 1, orderChanged: true });

    const enabled = rerankLocations(items, broadIntent, { mode: "enabled", personalization: "enabled", profile });
    expect(enabled.results[0].id).toBe("italian");
  });

  it("keeps anonymous and insufficient-evidence searches unpersonalized", () => {
    expect(rerankLocations(items, broadIntent, { mode: "enabled", personalization: "enabled" }).results[0].id).toBe("thai");
    const cold = buildUserPreferenceProfile("private-user", [
      { userId: "private-user", type: "click", occurredAt: new Date().toISOString(), cuisine: "italian" },
    ]);
    expect(rerankLocations(items, broadIntent, { mode: "enabled", personalization: "enabled", profile: cold }).results[0].id).toBe("thai");
  });

  it("never lets historical cuisine or activity conflict with explicit intent", () => {
    const explicit = {
      ...broadIntent,
      rawQuery: "Thai dinner and bowling",
      restaurantIntent: { ...broadIntent.restaurantIntent!, cuisineTerms: ["thai"] },
      activityIntent: { ...broadIntent.activityIntent!, activityTerms: ["bowling"] },
    };
    const conflicting = [
      { id: "history", name: "History", cuisine: "italian", activity_type: "karaoke", score: 10 },
      { id: "intent", name: "Intent", cuisine: "thai", activity_type: "bowling", score: 11 },
    ] as any;
    expect(rerankLocations(conflicting, explicit, { mode: "enabled", personalization: "enabled", profile }).results[0].id).toBe("intent");
  });

  it("fails open on profile query errors", async () => {
    const failingQuery = { select() { return this; }, eq() { return this; }, in() { return this; }, order() { return this; }, limit() { return Promise.resolve({ data: null, error: new Error("database unavailable") }); } };
    await expect(loadUserPreferenceProfile("private-user", { client: { from: () => failingQuery } as any })).rejects.toThrow("database unavailable");
  });

  it("times out profile loading quickly", async () => {
    const hangingQuery = { select() { return this; }, eq() { return this; }, in() { return this; }, order() { return this; }, limit() { return new Promise(() => undefined); } };
    await expect(loadUserPreferenceProfile("private-user", { client: { from: () => hangingQuery } as any, timeoutMs: 5 })).rejects.toThrow("profile_load_timeout");
  });
});
