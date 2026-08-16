import fs from "node:fs";
import path from "node:path";

describe("reservation seating preference order", () => {
  const repo = process.cwd();
  const reservePage = fs.readFileSync(path.join(repo, "app/reserve/location/[locationId]/page.tsx"), "utf8");
  const bookingPage = fs.readFileSync(path.join(repo, "app/reserve/location/[locationId]/booking/page.tsx"), "utf8");
  const seatingRoute = fs.readFileSync(path.join(repo, "app/api/reserve/location/seating-options/route.ts"), "utf8");
  const widgetRoute = fs.readFileSync(path.join(repo, "app/api/widgets/reservations/route.ts"), "utf8");
  const widget = fs.readFileSync(path.join(repo, "public/widgets/reservations.js"), "utf8");

  test("does not query the nonexistent locations default duration column", () => {
    expect(seatingRoute).not.toContain('.select("default_duration_minutes")');
    expect(seatingRoute).not.toContain("location?.default_duration_minutes");
    expect(seatingRoute).toContain("slot_duration_minutes");
  });

  test("filters times after seating preference on TheOutHaven", () => {
    expect(reservePage).toContain("Choose your seating area first. Available times below will match that choice.");
    expect(reservePage).toContain('preference: preference || "any"');
    expect(reservePage).toContain('times: times.join(",")');
    expect(reservePage).toContain("Choose a seating preference to see matching times.");
  });

  test("carries the selected seating area to the confirmation step", () => {
    expect(reservePage).toContain("seatingPreference,");
    expect(bookingPage).toContain('searchParams.get("seatingPreference")');
    expect(bookingPage).toContain("requestedSeatingPreference");
    expect(bookingPage).toContain("seating_preference: effectiveSeatingPreference");
  });

  test("hosted website uses the same preference-first time filtering", () => {
    expect(widgetRoute).toContain('request.nextUrl.searchParams.get("times")');
    expect(widgetRoute).toContain('request.nextUrl.searchParams.get("preference")');
    expect(widget).toContain("Choose your seating area first. Available times will match that choice.");
    expect(widget).toContain("filterTimes(state.seatingPreference)");
    expect(widget).toContain("available_times");
  });
});
