import { beforeEach, describe, expect, it, vi } from "vitest";

const searchPlacesTextNew = vi.fn();
const getPlaceDetailsNew = vi.fn();

vi.mock("../places-new-client", () => ({
  searchPlacesTextNew,
  getPlaceDetailsNew,
}));

import { findGooglePlaceForLocation, getGooglePlaceDetails } from "../places";

describe("canonical Google provider routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes identity search through the AWS-backed Places client", async () => {
    searchPlacesTextNew.mockResolvedValue([
      {
        id: "place-1",
        displayName: { text: "Test Restaurant" },
        formattedAddress: "10 Main St, New York, NY",
        primaryType: "restaurant",
        types: ["restaurant"],
      },
    ]);

    const result = await findGooglePlaceForLocation({
      name: "Test Restaurant",
      address: "10 Main St",
      city: "New York",
      state: "NY",
    });

    expect(searchPlacesTextNew).toHaveBeenCalledOnce();
    expect(searchPlacesTextNew).toHaveBeenCalledWith(
      "Test Restaurant 10 Main St New York NY",
      { pageSize: 5, regionCode: "US" },
    );
    expect(result.place?.id).toBe("place-1");
  });

  it("routes place details through the AWS-backed Places client", async () => {
    getPlaceDetailsNew.mockResolvedValue({ id: "place-2", displayName: { text: "Details" } });

    await expect(getGooglePlaceDetails("place-2")).resolves.toMatchObject({ id: "place-2" });
    expect(getPlaceDetailsNew).toHaveBeenCalledWith("place-2");
  });
});
