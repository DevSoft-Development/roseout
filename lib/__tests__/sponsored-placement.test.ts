import { describe, expect, it } from "vitest";
import {
  isSponsoredPlacement,
  sponsoredAttribution,
  sponsoredLabel,
} from "../sponsored-placement";

describe("sponsored placement disclosure", () => {
  it("recognizes every supported sponsored flag", () => {
    expect(isSponsoredPlacement({ sponsored: true })).toBe(true);
    expect(isSponsoredPlacement({ isSponsored: true })).toBe(true);
    expect(isSponsoredPlacement({ is_sponsored: true })).toBe(true);
    expect(isSponsoredPlacement({ placement_type: "sponsored" })).toBe(true);
  });

  it("never labels organic results as sponsored", () => {
    expect(sponsoredLabel({ placement_type: "organic" })).toBeNull();
    expect(sponsoredAttribution({}).placementType).toBe("organic");
  });

  it("preserves sponsor and promotion campaign attribution", () => {
    expect(
      sponsoredAttribution({
        sponsored: true,
        sponsor_id: 12,
        promotion_campaign_id: "c1",
      }),
    ).toEqual({
      sponsored: true,
      placementType: "sponsored",
      sponsorId: "12",
      campaignId: "c1",
    });
  });
});
