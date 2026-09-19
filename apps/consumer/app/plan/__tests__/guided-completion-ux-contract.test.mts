import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const gate = readFileSync(new URL("../PlanJourneyGate.tsx", import.meta.url), "utf8");
const overview = readFileSync(new URL("../GuidedCompletionOverview.tsx", import.meta.url), "utf8");

test("guided completion presents one customer-facing Step 4 shell", () => {
  assert.match(gate, /Finish your outing/);
  assert.match(gate, /Complete outing/);
  assert.match(gate, /guided-completion-inner > main > section:first-child/);
});

test("completion overview explains booking state and next step", () => {
  assert.match(overview, /Reservations/);
  assert.match(overview, /Plan saved/);
  assert.match(overview, /still need attention/);
  assert.match(overview, /Keep your plan handy/);
});
