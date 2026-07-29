import { describe, expect, it } from "vitest";
import { classifyReviewReason, safeSuggestedCorrections, summarizeReview } from "./profileReviewPolicy";

describe("profile review policy", () => {
  it("separates blocking conflicts from harmless warnings", () => {
    expect(classifyReviewReason("Missing primary domain")).toBe("blocking");
    expect(classifyReviewReason("Low confidence from limited evidence")).toBe("warning");
  });

  it("keeps serious conflicts blocked", () => {
    const summary = summarizeReview({
      location_id: "00000000-0000-4000-8000-000000000001",
      needs_review: true,
      confidence: 0.9,
      profile_version: 3,
      primary_domain: "activity",
      canonical_terms: ["arcade"],
      review_reasons: ["Domain conflict between restaurant and activity"],
    });
    expect(summary.severity).toBe("blocking");
    expect(summary.blockingReasons).toHaveLength(1);
  });

  it("builds deterministic safe corrections from existing profile fields", () => {
    const correction = safeSuggestedCorrections({
      location_id: "00000000-0000-4000-8000-000000000002",
      needs_review: true,
      confidence: 0.7,
      profile_version: 3,
      primary_domain: null,
      supported_domains: ["activity"],
      canonical_terms: [],
      activity_categories: ["bowling"],
      review_reasons: ["Missing primary domain", "Missing canonical terms"],
    });
    expect(correction.canApply).toBe(true);
    expect(correction.primaryDomain).toBe("activity");
    expect(correction.canonicalTerms).toContain("bowling");
  });
});
