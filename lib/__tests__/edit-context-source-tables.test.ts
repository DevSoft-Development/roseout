import { describe, expect, it } from "vitest";
import { sourceTableVariantsForType } from "@/app/api/locations/edit-context/route";

describe("sourceTableVariantsForType", () => {
  it("returns plural and singular restaurant source table variants", () => {
    expect(sourceTableVariantsForType("restaurants")).toEqual(["restaurants", "restaurant"]);
  });

  it("returns plural and singular activity source table variants", () => {
    expect(sourceTableVariantsForType("activities")).toEqual(["activities", "activity"]);
  });
});
