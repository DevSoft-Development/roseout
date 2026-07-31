import { describe, expect, it } from "vitest";
import { buildSearchPlan } from "../v2/planner/buildSearchPlan";
import { buildRetrievalRequests } from "../v2/retrieval/buildRetrievalRequests";
import { buildQaSearchLogRow, detectExpectedDomains } from "./qaSearchLog";

const plan = (query: string) => buildSearchPlan({ input: { query } as any });

const baseSummary = (query: string, overrides: Record<string, unknown> = {}) => ({
  query, ok: true, engine: "v2", normalized_search_type: "paired_outing", primary_domain: "mixed",
  restaurant_count: 1, activity_count: 1, pair_count: 1, result_count: 1, timing_ms: 500,
  speed_status: "fast", intentParserSource: "deterministic", no_results_reason: null, no_pairs_reason: null,
  suspiciousFlags: [], warnings: [], errors: [], needsRestaurant: true, needsActivity: true, ...overrides,
});

describe("QA expectation detection", () => {
  it.each([
    ["dinner and bowling near Roosevelt Field", "bowling"],
    ["brunch and an art gallery near Williamsburg", "art_gallery"],
    ["sushi and an escape room near Garden City", "escape_room"],
    ["halal restaurant and karaoke in Flushing", "karaoke"],
    ["Italian dinner and live music in Astoria", "live_music"],
  ])("detects explicit mixed intent for %s", (query, term) => {
    const expected = detectExpectedDomains(query);
    expect(expected.restaurant).toBe(true);
    expect(expected.activity).toBe(true);
    expect(expected.activityTerms).toContain(term);
  });

  it("fails when the parser drops an explicit activity domain", () => {
    const row = buildQaSearchLogRow(baseSummary("dinner and bowling near Roosevelt Field", { needsActivity: false, pair_count: 0, activity_count: 0 }), null);
    expect(row.technical_success).toBe(true);
    expect(row.quality_success).toBe(false);
    expect(row.quality_issue_type).toBe("dropped_expected_domain");
  });

  it("classifies completed zero-result searches as no_results", () => {
    const row = buildQaSearchLogRow(baseSummary("sushi and an escape room near Garden City", { result_count: 0, pair_count: 0, restaurant_count: 0, activity_count: 0, no_results_reason: "no_valid_results" }), null);
    expect(row.technical_success).toBe(true);
    expect(row.quality_issue_type).toBe("no_results");
  });
});

describe("near-place paired parsing", () => {
  it.each([
    ["Family-friendly dinner and bowling near Roosevelt Field on Saturday afternoon", "bowling"],
    ["Brunch and an art gallery near Williamsburg this Sunday", "art_gallery"],
    ["Sushi and an escape room near Garden City for four people", "escape_room"],
  ])("keeps both domains for %s", async (query, category) => {
    const result = await plan(query);
    expect(result.mode).toBe("paired_outing");
    expect(result.restaurant.required).toBe(true);
    expect(result.activity.required).toBe(true);
    expect(result.activity.categories).toContain(category);
  });
});

describe("named-anchor taxonomy isolation", () => {
  it("does not turn Gaming City into an arcade request", async () => {
    const result = await plan("Restaurant near Gaming City in Astoria");
    expect(result.mode).toBe("anchored_nearby");
    expect(result.restaurant.required).toBe(true);
    expect(result.activity.required).toBe(false);
    expect(result.activity.categories).toEqual([]);
    expect(result.pairing.required).toBe(false);
    expect(result.anchor.requested).toBe(true);
    expect(result.anchor.rawName).toBe("gaming city");
  });

  it.each([
    "Restaurant near Museum of the Moving Image",
    "Dinner near Brooklyn Bowl",
    "Food near Escape Virtuality",
  ])("does not infer an activity from anchor text: %s", async (query) => {
    const result = await plan(query);
    expect(result.mode).toBe("anchored_nearby");
    expect(result.restaurant.required).toBe(true);
    expect(result.activity.required).toBe(false);
    expect(result.activity.categories).toEqual([]);
    expect(result.pairing.required).toBe(false);
  });

  it("still preserves an explicitly requested activity outside the anchor name", async () => {
    const result = await plan("Dinner and karaoke near Gaming City in Astoria");
    expect(result.mode).toBe("paired_outing");
    expect(result.restaurant.required).toBe(true);
    expect(result.activity.required).toBe(true);
    expect(result.activity.categories).toContain("karaoke");
    expect(result.activity.categories).not.toContain("arcade");
  });
});

describe("retrieval expansion", () => {
  it("expands live music retrieval", async () => {
    const requests = buildRetrievalRequests(await plan("Italian dinner and live music in Astoria tonight"));
    expect(requests.find((request) => request.desiredRole === "live_music_activity")?.retrievalTerms).toEqual(expect.arrayContaining(["live band", "music venue", "jazz club", "bar with live music"]));
  });

  it("expands halal restaurant retrieval", async () => {
    const requests = buildRetrievalRequests(await plan("Halal restaurant and karaoke in Flushing"));
    expect(requests.find((request) => request.desiredRole === "restaurant")?.retrievalTerms).toEqual(expect.arrayContaining(["halal restaurant", "zabiha", "middle eastern", "pakistani"]));
  });
});
