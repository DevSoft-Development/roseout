import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("reservation consumer flow contract", () => {
  it("keeps ordinary table inventory out of the customer booking form", () => {
    const source = readFileSync("app/reserve/location/[locationId]/page.tsx", "utf8");
    expect(source).toContain('fetch("/api/reserve/location/auto"');
    expect(source).toContain('label="Party size"');
    expect(source).toContain("Available times");
    expect(source).not.toContain("bookable_item_id:");
    expect(source).not.toContain("Reserved space");
    expect(source).not.toContain("Select a table");
  });

  it("adds real-data venue tabs without placeholder menu content", () => {
    const source = readFileSync("app/reserve/location/[locationId]/page.tsx", "utf8");
    expect(source).toContain('label: "Overview"');
    expect(source).toContain('label: "Photos"');
    expect(source).toContain('label: "Menu"');
    expect(source).toContain('label: "Details"');
    expect(source).toContain('label: "Location"');
    expect(source).toContain("if (menuUrl)");
    expect(source).toContain("/api/reserve/location/details");
  });

  it("delegates auto-assigned bookings into the existing proven reservation route", () => {
    const source = readFileSync("app/api/reserve/location/auto/route.ts", "utf8");
    expect(source).toContain('import { POST as createReservation } from "../route"');
    expect(source).toContain('.select("id, capacity_min, capacity_max, slot_duration_minutes")');
    expect(source).toContain("item.slot_duration_minutes || 90");
    expect(source).not.toContain('capacity_max, turn_time_minutes")');
    expect(source).toContain('.order("capacity_max", { ascending: true })');
    expect(source).toContain("bookable_item_id: selectedItem.id");
    expect(source).toContain("return createReservation(delegatedRequest)");
  });
});
