import { describe, expect, it } from "vitest";
import { reviewVerificationExplanation, reviewVerificationLabel } from "../verification";

describe("review verification semantics", () => {
  it("labels only verified visits", () => {
    expect(reviewVerificationLabel({ verified_visit: true })).toBe("Verified visit");
    expect(reviewVerificationLabel({ verified_visit: false })).toBeNull();
    expect(reviewVerificationLabel({})).toBeNull();
  });

  it("explains that verification applies to the visit, not the opinion", () => {
    expect(reviewVerificationExplanation({ verified_visit: true })).toMatch(/visit or booking/i);
    expect(reviewVerificationExplanation({ verified_visit: true })).toMatch(/own opinion/i);
  });
});
