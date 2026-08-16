import fs from "node:fs";
import path from "node:path";

describe("hosted website and guest seating preference integration", () => {
  const repo = process.cwd();
  const layout = fs.readFileSync(
    path.join(repo, "app/locations/[type]/[locationId]/layout.tsx"),
    "utf8",
  );
  const booking = fs.readFileSync(
    path.join(repo, "app/reserve/location/[locationId]/booking/page.tsx"),
    "utf8",
  );
  const autoRoute = fs.readFileSync(
    path.join(repo, "app/api/reserve/location/auto/route.ts"),
    "utf8",
  );
  const seatingRoute = fs.readFileSync(
    path.join(repo, "app/api/reserve/location/seating-options/route.ts"),
    "utf8",
  );
  const widgetRoute = fs.readFileSync(
    path.join(repo, "app/api/widgets/reservations/route.ts"),
    "utf8",
  );
  const widget = fs.readFileSync(
    path.join(repo, "public/widgets/reservations.js"),
    "utf8",
  );
  const migration = fs.readFileSync(
    path.join(repo, "supabase/migrations/20260816175500_public_bar_booking_inventory.sql"),
    "utf8",
  );

  test("keeps the public profile and links live hosted websites as a separate destination", () => {
    expect(layout).toContain('.from("business_websites")');
    expect(layout).toContain('.eq("status", "live")');
    expect(layout).toContain('.eq("deployment_status", "deployed")');
    expect(layout).toContain('.eq("last_publish_status", "published")');
    expect(layout).toContain("Visit Website ↗");
    expect(layout).toContain("{children}");
  });

  test("only offers seating preference from live table and adjacent bar availability", () => {
    expect(booking).toContain("Seating preference");
    expect(booking).toContain("No preference");
    expect(booking).toContain("Table seating");
    expect(booking).toContain("Bar seating");
    expect(booking).toContain("seating_preference: effectiveSeatingPreference");
    expect(seatingRoute).toContain("reservation_resource_assignments");
    expect(seatingRoute).toContain("contiguous");
    expect(seatingRoute).toContain("show_preference: showPreference");
  });

  test("does not expose exact guest table selection and filters auto assignment by area", () => {
    expect(booking).toContain("Exact placement stays with the venue");
    expect(autoRoute).toContain('seatingPreference === "bar"');
    expect(autoRoute).toContain('seatingPreference === "dining"');
    expect(autoRoute).toContain("bookable_item_id: selectedItem.id");
  });

  test("uses the same seating preference behavior inside generated hosted websites", () => {
    expect(widget).toContain("Seating preference");
    expect(widget).toContain("No preference");
    expect(widget).toContain("Table seating");
    expect(widget).toContain("Bar seating");
    expect(widget).toContain('request("seating"');
    expect(widget).toContain("seating_preference: effectiveSeatingPreference()");
    expect(widgetRoute).toContain('["availability", "seating"]');
    expect(widgetRoute).toContain("/api/reserve/location/seating-options");
    expect(widgetRoute).toContain('action === "book"');
    expect(widgetRoute).toContain('"/api/reserve/location/auto"');
  });

  test("bridges bar containers into aggregate public inventory while stools stay private", () => {
    expect(migration).toContain("reserve_sync_bar_bookable_item");
    expect(migration).toContain("location_bookable_items");
    expect(migration).toContain("capacity_min");
    expect(migration).toContain("capacity_max");
    expect(migration).toContain("Exact stools stay private");
  });
});
