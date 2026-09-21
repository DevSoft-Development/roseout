import { describe, expect, it } from "vitest";
import { locationFreshnessLabel, locationTrustSignals } from "../location-trust";

describe("location trust signals", () => {
  const now = new Date("2026-09-21T12:00:00Z");
  it("keeps claimed and verified meanings distinct", () => {
    expect(locationTrustSignals({ is_claimed: true }, now)).toMatchObject({ claimed: true, verified: false });
    expect(locationTrustSignals({ is_verified: true }, now)).toMatchObject({ verified: true });
  });
  it("only treats explicit verified status as verification", () => {
    expect(locationTrustSignals({ claim_status: "approved" }, now)).toMatchObject({ claimed: true, verified: false });
    expect(locationTrustSignals({ claim_verification_status: "verified" }, now)).toMatchObject({ verified: true });
  });
  it("marks checks within 30 days as recent", () => {
    expect(locationFreshnessLabel({ last_quality_check_at: "2026-09-10T12:00:00Z" }, now)).toBe("Recently checked");
    expect(locationFreshnessLabel({ last_quality_check_at: "2026-07-01T12:00:00Z" }, now)).toMatch(/^Checked /);
  });
});
