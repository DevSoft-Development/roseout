import fs from "node:fs";
import path from "node:path";

describe("reservation seating preference visibility", () => {
  const repo = process.cwd();
  const reservePage = fs.readFileSync(
    path.join(repo, "app/reserve/location/[locationId]/page.tsx"),
    "utf8",
  );
  const widget = fs.readFileSync(
    path.join(repo, "public/widgets/reservations.js"),
    "utf8",
  );

  test("shows seating preference on the first TheOutHaven reservation step", () => {
    expect(reservePage).toContain("Seating preference");
    expect(reservePage).toContain("Select an available time to see whether table seating and bar seating are available");
    expect(reservePage).toContain("/api/reserve/location/seating-options");
    expect(reservePage).toContain("No preference");
    expect(reservePage).toContain("Table seating");
    expect(reservePage).toContain("Bar seating");
    expect(reservePage).toContain("seatingPreference: effectiveSeatingPreference");
  });

  test("keeps the hosted widget seating area visible before a time is selected", () => {
    expect(widget).toContain("Select an available time to see whether table seating and bar seating are available");
    expect(widget).toContain('request("seating"');
    expect(widget).toContain("No preference");
    expect(widget).toContain("Table seating");
    expect(widget).toContain("Bar seating");
  });

  test("never exposes exact table or stool selection to guests", () => {
    expect(reservePage).toContain("Exact placement stays with the venue");
    expect(widget).toContain("Exact placement is assigned by the venue");
  });
});
