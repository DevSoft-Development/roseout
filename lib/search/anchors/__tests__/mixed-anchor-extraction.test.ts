import { describe, expect, it } from "vitest";
import { extractMixedOutingAnchor } from "../extractMixedAnchor";

describe("extractMixedOutingAnchor", () => {
  it("extracts an alias-based anchor from a mixed outing", () => {
    expect(
      extractMixedOutingAnchor("dinner with hookah after near msg"),
    ).toEqual({
      intentQuery: "dinner with hookah",
      rawAnchorText: "msg",
      relationship: "near",
    });
  });

  it("works for arbitrary anchor names managed by the registry", () => {
    expect(
      extractMixedOutingAnchor(
        "seafood dinner and bowling close to Barclays Center",
      ),
    ).toEqual({
      intentQuery: "seafood dinner and bowling",
      rawAnchorText: "Barclays Center",
      relationship: "close_to",
    });
  });

  it("does not convert restaurant-only nearby searches into mixed outings", () => {
    expect(extractMixedOutingAnchor("dinner near Madison Square Garden")).toBeNull();
  });
});
