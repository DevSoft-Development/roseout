import { describe, expect, it } from "vitest";
import { evaluateSearchAcceptanceContracts } from "./searchAcceptanceContracts";

function resultWithActivityExclusions(exclusions: string[]) {
  return {
    query: "Dinner then karaoke, but no bowling",
    requestFulfilled: true,
    searchV2: {
      requestedMode: "paired_outing",
      searchPlan: {
        rawQuery: "Dinner then karaoke, but no bowling",
        mode: "paired_outing",
        restaurant: { required: true, cuisines: [], foods: [], features: [], exclusions: [] },
        activity: { required: true, categories: ["karaoke"], exclusions },
        relationship: { type: "sequential" },
      },
    },
  };
}

describe("search acceptance contract exclusion enforcement", () => {
  it("fails QA when a hard user exclusion disappears from the search plan", () => {
    const matrix = evaluateSearchAcceptanceContracts({
      result: resultWithActivityExclusions([]),
      counts: { restaurants: 1, activities: 1, pairs: 1, displayed: 3 },
    });

    expect(matrix.intent.passed).toBe(false);
    expect(matrix.intent.evidence.missingActivityExclusions).toEqual(["bowling"]);
    expect(matrix.testPassed).toBe(false);
  });

  it("passes the intent contract when the extracted hard exclusion is preserved", () => {
    const matrix = evaluateSearchAcceptanceContracts({
      result: resultWithActivityExclusions(["bowling"]),
      counts: { restaurants: 1, activities: 1, pairs: 1, displayed: 3 },
    });

    expect(matrix.intent.passed).toBe(true);
    expect(matrix.intent.evidence.missingActivityExclusions).toEqual([]);
  });
});
