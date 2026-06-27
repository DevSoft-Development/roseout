import { describe, expect, it } from "vitest";
import { formatFullAddress, stripCityStateZipFromAddress } from "@/lib/address-utils";
import { inferNycAddressArea, getPublicAreaLabel } from "@/lib/nyc-address-inference";
import { inferMarketFromCityStateCounty } from "@/lib/location-markets";

describe("address formatting", () => {
  it("does not duplicate city state zip on create cards", () => {
    expect(
      formatFullAddress({
        address: "727 7th Ave, New York, NY 10019",
        city: "New York",
        state: "NY",
        zip_code: "10019",
      }),
    ).toBe("727 7th Ave, New York, NY 10019");
  });

  it("strips duplicate suffix from saved address", () => {
    expect(
      stripCityStateZipFromAddress(
        "727 7th Ave, New York, NY 10019",
        "New York",
        "NY",
        "10019",
      ),
    ).toBe("727 7th Ave");
  });

  it("infers Long Island City as Queens NYC Core, not Long Island", () => {
    expect(
      inferNycAddressArea({
        address: "11-01 43rd Ave, New York, NY, 11101",
        city: "New York",
        state: "NY",
        zip_code: "11101",
      }),
    ).toEqual({
      borough: "Queens",
      neighborhood: "Long Island City",
      market: "NYC_CORE",
    });
  });

  it("keeps LIC out of the Long Island market", () => {
    expect(
      inferMarketFromCityStateCounty({
        address: "11-01 43rd Ave, New York, NY, 11101",
        city: "New York",
        state: "NY",
        zip_code: "11101",
        market: "LONG_ISLAND",
      }),
    ).toBe("NYC_CORE");
  });

  it("shows LIC public area label", () => {
    expect(
      getPublicAreaLabel({
        address: "11-01 43rd Ave, New York, NY, 11101",
        city: "New York",
        state: "NY",
        zip_code: "11101",
      }),
    ).toBe("Long Island City, Queens");
  });
});
