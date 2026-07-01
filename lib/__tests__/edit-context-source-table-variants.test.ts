import { describe, expect, it } from "vitest";
import { sourceTableVariantsForType } from "@/app/api/locations/edit-context/route";

describe("sourceTableVariantsForType", () => {
  it("supports plural and singular restaurant source_table values", () => {
    expect(sourceTableVariantsForType("restaurants")).toEqual(["restaurants", "restaurant"]);
  });

  it("supports plural and singular activity source_table values", () => {
    expect(sourceTableVariantsForType("activities")).toEqual(["activities", "activity"]);
  });
});
