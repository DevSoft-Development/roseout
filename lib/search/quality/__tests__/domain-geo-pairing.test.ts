import { describe, expect, it } from "vitest";
import { buildSearchQualityContext, evaluateSearchQuality } from "../index";

describe("domain geo and pairing rules", () => {
  it("flags wrong-domain, missing mixed component, geo mismatch and missing pair", () => {
    const context = buildSearchQualityContext({
      query: "restaurant and activity in Queens",
      intent: { searchType: "mixed_outing", primaryDomain: "restaurant", wantsPairing: true, geo: { borough: "Queens", state: "NY" } },
      result: { success: true, activities: [{ id: "a1", location_type: "activity", borough: "Manhattan", state: "NY" }], pairs: [] },
    });
    const evaluation = evaluateSearchQuality(context);
    expect(evaluation.suspiciousFlags).toEqual(expect.arrayContaining([
      "wrong_result_domain",
      "missing_mixed_component",
      "geo_mismatch_in_top_results",
      "pair_requested_but_missing",
    ]));
  });

  it("flags pairs beyond the requested walking limit", () => {
    const context = buildSearchQualityContext({
      query: "dinner and bowling within 20 minutes walk",
      intent: { wantsPairing: true, pairingPreference: { maxPairWalkingMinutes: 20 } },
      result: { success: true, pairs: [{ id: "p1", pairWalkingMinutes: 35 }] },
    });
    expect(evaluateSearchQuality(context).suspiciousFlags).toContain("walking_constraint_violated");
  });
});
