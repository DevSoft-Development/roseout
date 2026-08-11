import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const reservePage = fs.readFileSync(
  path.join(root, "app/reserve/location/[locationId]/page.tsx"),
  "utf8",
);
const bookingPage = fs.readFileSync(
  path.join(root, "app/reserve/location/[locationId]/booking/page.tsx"),
  "utf8",
);

describe("reservation preferred-time booking funnel", () => {
  it("uses a calendar date picker and preferred-time dropdown before availability buttons", () => {
    expect(reservePage).toContain('type="date"');
    expect(reservePage).toContain('label="Preferred time"');
    expect(reservePage).toContain("Available at or after your preferred time");
    expect(reservePage).toContain("currentSlots.filter((slot) => slot.time >= preferredTime)");
  });

  it("moves customer details to a dedicated booking step", () => {
    expect(reservePage).toContain("/booking?");
    expect(reservePage).not.toContain('placeholder="Name"');
    expect(bookingPage).toContain("Complete your reservation");
    expect(bookingPage).toContain("Guest details");
    expect(bookingPage).toContain("Reservation summary");
  });

  it("keeps PII out of the selection URL and uses the proven auto-assignment POST", () => {
    expect(reservePage).not.toContain('query.set("customer_name"');
    expect(reservePage).not.toContain('query.set("customer_email"');
    expect(reservePage).not.toContain('query.set("customer_phone"');
    expect(bookingPage).toContain('fetch("/api/reserve/location/auto"');
    expect(bookingPage).toContain("customer_name: name");
    expect(bookingPage).toContain("customer_email: email");
    expect(bookingPage).toContain("customer_phone: phone");
  });

  it("rechecks selected-time availability before allowing confirmation", () => {
    expect(bookingPage).toContain("setSlotStillAvailable(available)");
    expect(bookingPage).toContain("That time is no longer available");
    expect(bookingPage).toContain("disabled={!slotStillAvailable || submitting}");
  });
});
