import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../GuidedResultsPageV4.tsx", import.meta.url), "utf8");

test("Step 3 makes the strongest recommendation obvious", () => {
  assert.match(source, /Best Match/);
  assert.match(source, /Choose this outing/);
  assert.match(source, /Matched to your plan/);
});

test("Step 3 explains matches with concise query-driven signals", () => {
  assert.match(source, /Matched to your search/);
  assert.match(source, /pairSignals/);
  assert.match(source, /PROXIMITY_INTENT/);
  assert.match(source, /QUALITY_INTENT/);
  assert.doesNotMatch(source, /Why we picked this pair/);
});

test("secondary result actions are progressively disclosed", () => {
  assert.match(source, /<details/);
  assert.match(source, /View details/);
  assert.match(source, /View restaurant/);
});

test("custom outing builder remains available as a secondary path", () => {
  assert.match(source, /Build your own outing/);
  assert.match(source, /planner_custom_pair_selected/);
  assert.match(source, /Choose my outing/);
});
