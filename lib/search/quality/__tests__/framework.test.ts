import { describe, expect, it } from "vitest";
import { buildSearchQualityContext, evaluateSearchQualityScaffold } from "../index";

describe("search quality framework", () => {
  it("separates technical success from quality evaluation", () => {
    const context = buildSearchQualityContext({
      query: "arcade in queens",
      result: { success: true, activities: [{ id: "1" }] },
    });
    const evaluation = evaluateSearchQualityScaffold(context);
    expect(evaluation.technicalSuccess).toBe(true);
    expect(evaluation.qualitySuccess).toBe(true);
    expect(evaluation.findings).toEqual([]);
  });
});
