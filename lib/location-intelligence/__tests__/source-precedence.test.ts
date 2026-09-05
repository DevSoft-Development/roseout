import { describe, expect, it } from "vitest";
import {
  LOCATION_SOURCE_PRECEDENCE,
  isClaimedLocation,
  mayReplaceLocationField,
} from "../source-precedence";

describe("Location Intelligence source precedence", () => {
  it("keeps the canonical authority order stable", () => {
    expect(LOCATION_SOURCE_PRECEDENCE.owner).toBeGreaterThan(LOCATION_SOURCE_PRECEDENCE.trusted_internal);
    expect(LOCATION_SOURCE_PRECEDENCE.trusted_internal).toBeGreaterThan(LOCATION_SOURCE_PRECEDENCE.google);
    expect(LOCATION_SOURCE_PRECEDENCE.google).toBeGreaterThan(LOCATION_SOURCE_PRECEDENCE.official_website);
    expect(LOCATION_SOURCE_PRECEDENCE.official_website).toBeGreaterThan(LOCATION_SOURCE_PRECEDENCE.secondary_provider);
    expect(LOCATION_SOURCE_PRECEDENCE.secondary_provider).toBeGreaterThan(LOCATION_SOURCE_PRECEDENCE.ai_inference);
  });

  it("recognizes every supported claimed-location signal", () => {
    expect(isClaimedLocation({ is_claimed: true })).toBe(true);
    expect(isClaimedLocation({ claimed: true })).toBe(true);
    expect(isClaimedLocation({ owner_user_id: "owner" })).toBe(true);
    expect(isClaimedLocation({ claim_status: "approved" })).toBe(true);
    expect(isClaimedLocation({ claim_status: "claimed" })).toBe(true);
    expect(isClaimedLocation({ claim_status: "pending" })).toBe(false);
  });

  it("never lets routine providers overwrite protected claimed fields", () => {
    const location = { is_claimed: true, phone: "516-555-0100" };
    expect(mayReplaceLocationField({
      location,
      field: "phone",
      incomingSource: "google",
      currentSource: "google",
      currentValue: location.phone,
    })).toBe(false);
    expect(mayReplaceLocationField({
      location,
      field: "phone",
      incomingSource: "owner",
      currentSource: "google",
      currentValue: location.phone,
    })).toBe(true);
  });

  it("allows enrichment to fill missing fields", () => {
    expect(mayReplaceLocationField({
      location: { is_claimed: true, website: null },
      field: "website",
      incomingSource: "google",
      currentSource: null,
      currentValue: null,
      onlyWhenMissing: true,
    })).toBe(true);
  });

  it("rejects lower-authority evidence over higher-authority evidence", () => {
    expect(mayReplaceLocationField({
      location: { is_claimed: false, website: "https://example.com" },
      field: "website",
      incomingSource: "official_website",
      currentSource: "google",
      currentValue: "https://example.com",
    })).toBe(false);
  });
});
