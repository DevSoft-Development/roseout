import { describe, expect, it } from "vitest";
import { getBusinessMenuEditorHref, getPublicLocationMenuHref } from "../public-location-url";

describe("public location menu links", () => {
  it("builds the public menu URL", () => {
    expect(getPublicLocationMenuHref({ id: "loc_123", location_type: "restaurant" })).toBe("/locations/restaurants/loc_123/menu");
  });
  it("preserves menu editor location context", () => {
    expect(getBusinessMenuEditorHref("loc_123")).toBe("/business/dashboard/menu?locationId=loc_123");
    expect(getBusinessMenuEditorHref("loc_123", "admin")).toBe("/business/dashboard/menu?adminLocationId=loc_123");
  });
});
