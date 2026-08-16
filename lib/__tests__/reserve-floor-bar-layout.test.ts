import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const floor = readFileSync("components/reserve/ReserveFloorSnapshot.tsx", "utf8");

describe("Reserve floor physical layout", () => {
  it("renders bar seating before the dining floor", () => {
    const barIndex = floor.indexOf("Bar Seating");
    const diningIndex = floor.indexOf("Dining Floor");

    expect(barIndex).toBeGreaterThan(-1);
    expect(diningIndex).toBeGreaterThan(-1);
    expect(barIndex).toBeLessThan(diningIndex);
  });

  it("separates bar resources from regular floor resources", () => {
    expect(floor).toContain("const barResources = floorResources.filter(isBarResource)");
    expect(floor).toContain("const tableResources = floorResources.filter((resource) => !isBarResource(resource))");
  });

  it("renders a horizontal bar rail with individual stools", () => {
    expect(floor).toContain("Full-width bar rail with individually assignable stools.");
    expect(floor).toContain("gridTemplateColumns: `repeat(${capacity}, minmax(38px, 1fr))`");
    expect(floor).toContain("parties receive adjacent available stools automatically");
  });

  it("keeps large dining floors independently scrollable", () => {
    expect(floor).toContain('resources.length > 12 ? "max-h-[min(58vh,520px)] overflow-y-auto');
  });
});
