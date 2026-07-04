import { describe, expect, it } from "vitest";
import { buildCanonicalClaimUrlFromToken } from "@/lib/claimQr";
import { normalizeClaimTarget } from "../claims";

describe("canonical claim helpers", () => {
  it("normalizes restaurant targets safely", () => {
    expect(normalizeClaimTarget({ id: "r1", __sourceTable: "restaurants", restaurant_name: "Rose Cafe", address: "1 Main", claim_status: "unclaimed", claim_token: "tok" })).toMatchObject({ locationId: "r1", sourceId: "r1", locationType: "restaurant", displayName: "Rose Cafe", address: "1 Main", status: "unclaimed" });
  });

  it("normalizes activity targets safely", () => {
    expect(normalizeClaimTarget({ id: "a1", __sourceTable: "activities", activity_name: "Kayak Tour", claim_code: "TOH-ABCD-2345" })).toMatchObject({ locationType: "activity", displayName: "Kayak Tour", claimCode: "TOH-ABCD-2345" });
  });

  it("normalizes unified locations without private owner fields", () => {
    expect(normalizeClaimTarget({ id: "l1", source_table: "locations", name: "Unified Place", owner_email: "secret@example.com" })).toEqual(expect.not.objectContaining({ owner_email: "secret@example.com" }));
  });

  it("builds new claim URLs on the canonical claim route", () => {
    expect(buildCanonicalClaimUrlFromToken("token 123")).toBe("/claim/token%20123");
  });
});
