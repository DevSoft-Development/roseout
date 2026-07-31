import { describe, expect, it } from "vitest";
import { buildQaSearchLogRow, classifyQaIssue, type QaSearchSummary } from "./qaSearchLog";

const baseSummary: QaSearchSummary = {
  query: "Fun indoor activity with my teenage son in Queens tonight",
  ok: true,
  engine: "v2",
  normalized_search_type: "activity_only",
  primary_domain: "activity",
  restaurant_count: 0,
  activity_count: 9,
  pair_count: 0,
  result_count: 9,
  timing_ms: 479,
  speed_status: "fast",
  intentParserSource: "deterministic",
  no_results_reason: null,
  no_pairs_reason: null,
  suspiciousFlags: [],
  warnings: [],
  errors: [],
  needsRestaurant: false,
  needsActivity: true,
};

describe("QA search log persistence metadata", () => {
  it("marks a healthy single-domain QA search as successful", () => {
    const row = buildQaSearchLogRow(baseSummary, "request-1");
    expect(row.query).toBe(baseSummary.query);
    expect(row.technical_success).toBe(true);
    expect(row.quality_success).toBe(true);
    expect(row.quality_issue_type).toBeNull();
    expect(row.quality_findings).toMatchObject({
      source: "admin_search_health_batch_qa",
      requestId: "request-1",
      searchType: "activity_only",
      primaryDomain: "activity",
      activityCount: 9,
    });
  });

  it("marks a paired query with no pair as a high-priority quality failure", () => {
    const summary = {
      ...baseSummary,
      query: "Italian dinner and live music in Astoria",
      normalized_search_type: "paired_outing",
      primary_domain: "mixed",
      restaurant_count: 8,
      activity_count: 0,
      pair_count: 0,
      result_count: 8,
      no_results_reason: "partial_restaurants_only",
      suspiciousFlags: ["deterministic_fallback", "mixed_no_pairs"],
      needsRestaurant: true,
      needsActivity: true,
    };

    expect(classifyQaIssue(summary)).toEqual({
      severity: "high",
      type: "missing_pair",
      label: "partial_restaurants_only",
    });

    const row = buildQaSearchLogRow(summary, "request-2");
    expect(row.technical_success).toBe(true);
    expect(row.quality_success).toBe(false);
    expect(row.quality_issue_type).toBe("missing_pair");
  });

  it("marks no-result searches as high-priority failures", () => {
    const row = buildQaSearchLogRow({
      ...baseSummary,
      query: "Sushi and an escape room near Garden City for four people",
      restaurant_count: 0,
      activity_count: 0,
      result_count: 0,
      no_results_reason: "no_valid_results",
      suspiciousFlags: ["no_results"],
      needsRestaurant: true,
      needsActivity: false,
    }, "request-3");

    expect(row.quality_success).toBe(false);
    expect(row.quality_issue_type).toBe("no_results");
    expect(row.quality_issue_label).toBe("no_valid_results");
  });

  it("keeps technical failures distinct from quality failures", () => {
    const row = buildQaSearchLogRow({
      ...baseSummary,
      ok: false,
      result_count: 0,
      errors: ["Search execution failed"],
      suspiciousFlags: ["errors", "no_results"],
    }, null);

    expect(row.technical_success).toBe(false);
    expect(row.quality_success).toBe(false);
    expect(row.quality_issue_type).toBe("technical_failure");
    expect(row.quality_issue_label).toBe("Search execution failed");
  });
});
