import { describe, expect, it } from "vitest";
import { aggregateCanonicalEligibility } from "./canonicalEligibility";

describe("canonical location eligibility", () => {
  it("disables a single-source location when its only source is not searchable", () => {
    expect(
      aggregateCanonicalEligibility([
        {
          status: "approved",
          isSearchable: false,
          isHidden: false,
          isLowLevel: false,
        },
      ]),
    ).toEqual({
      backingSourceCount: 1,
      active: true,
      isSearchable: false,
      isHidden: false,
      isLowLevel: false,
    });
  });

  it("keeps a multi-source location searchable when one valid source remains", () => {
    expect(
      aggregateCanonicalEligibility([
        {
          status: "approved",
          isSearchable: false,
          isHidden: false,
          isLowLevel: false,
        },
        {
          status: "approved",
          isSearchable: true,
          isHidden: false,
          isLowLevel: false,
        },
      ]),
    ).toEqual({
      backingSourceCount: 2,
      active: true,
      isSearchable: true,
      isHidden: false,
      isLowLevel: false,
    });
  });

  it("does not let one hidden or low-level source hide a valid sibling source", () => {
    expect(
      aggregateCanonicalEligibility([
        {
          status: "approved",
          isSearchable: true,
          isHidden: true,
          isLowLevel: true,
        },
        {
          status: "approved",
          isSearchable: true,
          isHidden: false,
          isLowLevel: false,
        },
      ]),
    ).toMatchObject({
      active: true,
      isSearchable: true,
      isHidden: false,
      isLowLevel: false,
    });
  });

  it("marks a location hidden and low-level only when every backing source agrees", () => {
    expect(
      aggregateCanonicalEligibility([
        {
          status: "approved",
          isSearchable: true,
          isHidden: true,
          isLowLevel: true,
        },
        {
          status: "approved",
          isSearchable: true,
          isHidden: true,
          isLowLevel: true,
        },
      ]),
    ).toMatchObject({
      active: true,
      isSearchable: false,
      isHidden: true,
      isLowLevel: true,
    });
  });
});
