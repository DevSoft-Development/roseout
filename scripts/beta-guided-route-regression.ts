import assert from "node:assert/strict";
import { completedStepsFor } from "../app/api/beta/guided/route";

const searchRunSteps = completedStepsFor("search_run", []);
assert.deepEqual(searchRunSteps, ["write_outing", "review_results"]);
assert(searchRunSteps.every((step) => typeof step === "string"));
assert(!searchRunSteps.some((step) => typeof step === "number"));

const legacyNumericSteps = completedStepsFor("selection", [1, 2]);
assert.deepEqual(legacyNumericSteps, [
  "write_outing",
  "review_results",
  "choose_match",
]);
assert(!legacyNumericSteps.includes(1 as never));

console.log("Beta guided route regression checks passed.");
