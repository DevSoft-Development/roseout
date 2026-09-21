import { describe, expect, it } from "vitest";
import { validatePublicSearchResponse } from "../response/validatePublicSearchResponse";

describe("public match reason contract", () => {
  it("accepts typed match reasons on cards and pairs", () => {
    const location = { id: "loc-1", matchReasons: ["Italian"], matchReasonDetails: [{ type: "cuisine", label: "Italian" }] };
    const response: any = {
      version: "public-search-v2", success: true, requestFulfilled: true, partialResults: false,
      requestId: "req-1", requestedMode: "restaurant_only", resolvedMode: "restaurant_only",
      primaryDomain: "restaurant", primary_domain: "restaurant", displayMode: "restaurant_cards",
      searchPlan: {}, restaurants: [location], activities: [], sameVenueResults: [], pairs: [],
      builder: { restaurants: [], activities: [] }, counts: {}, fallback: {}, retrieval: {},
    };
    expect(() => validatePublicSearchResponse(response)).not.toThrow();
  });

  it("rejects malformed typed reasons", () => {
    const response: any = {
      version: "public-search-v2", success: true, requestId: "req-1", searchPlan: {}, counts: {}, fallback: {}, retrieval: {},
      restaurants: [{ id: "loc-1", matchReasonDetails: [{ type: "cuisine" }] }], activities: [], sameVenueResults: [], pairs: [],
      builder: { restaurants: [], activities: [] },
    };
    expect(() => validatePublicSearchResponse(response)).toThrow(/matchReasonDetails/);
  });
});
