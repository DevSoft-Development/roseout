import assert from "node:assert/strict";
import test from "node:test";
import { buildSearchPlan } from "./buildSearchPlan";
import { detectDomainNegation } from "./domainNegation";

async function plan(query: string) {
  return buildSearchPlan({ input: { query, selectedLane: "auto" } as any });
}

test("activity-only negation removes the restaurant lane", async () => {
  const query = "I’m not looking for food at all; give me interesting evening activities in Manhattan that work for a date and are open tonight";
  const result = await plan(query);
  assert.equal(result.mode, "activity_only");
  assert.equal(result.restaurant.required, false);
  assert.equal(result.activity.required, true);
  assert.equal(result.pairing.required, false);
});

test("restaurant-only negation removes activity pairing", async () => {
  const query = "I only want a restaurant for a quiet anniversary dinner in Manhattan, with excellent food and an elegant atmosphere but no activity pairing";
  const result = await plan(query);
  assert.equal(result.mode, "restaurant_only");
  assert.equal(result.restaurant.required, true);
  assert.equal(result.activity.required, false);
  assert.equal(result.pairing.required, false);
});

test("not only does not create false domain negation", () => {
  const result = detectDomainNegation("I want not only dinner but also live jazz afterward");
  assert.equal(result.restaurant, false);
  assert.equal(result.activity, false);
});

test("normal mixed requests remain mixed", async () => {
  const result = await plan("Italian dinner followed by live jazz in Manhattan");
  assert.equal(result.mode, "paired_outing");
  assert.equal(result.restaurant.required, true);
  assert.equal(result.activity.required, true);
  assert.equal(result.pairing.required, true);
});
