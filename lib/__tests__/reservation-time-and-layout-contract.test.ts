import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isReservationTimeInPastNewYork } from "@/lib/reservations/reservationTime";

describe("reservation booking experience", () => {
  it("filters elapsed same-day times using New York time", () => {
    const now = new Date("2026-08-11T21:51:00.000Z"); // 5:51 PM EDT

    expect(isReservationTimeInPastNewYork("2026-08-11", "17:30", now)).toBe(true);
    expect(isReservationTimeInPastNewYork("2026-08-11", "17:51", now)).toBe(true);
    expect(isReservationTimeInPastNewYork("2026-08-11", "18:00", now)).toBe(false);
    expect(isReservationTimeInPastNewYork("2026-08-12", "09:00", now)).toBe(false);
    expect(isReservationTimeInPastNewYork("2026-08-10", "22:00", now)).toBe(true);
  });

  it("keeps the reservation page reservation-first and compact", () => {
    const source = readFileSync("app/reserve/location/[locationId]/page.tsx", "utf8");

    expect(source).toContain("Make a reservation");
    expect(source).toContain("Find a time");
    expect(source).toContain("Available times");
    expect(source).toContain("Guest details");
    expect(source).toContain("Reserved space");
    expect(source).toContain("INITIAL_VISIBLE_TIMES = 6");
    expect(source).toContain("isReservationTimeInPastNewYork(date, slot.time)");
    expect(source).toContain("Reservation confirmed. Check your email or SMS for your manage link.");
  });

  it("rejects past reservation times in server-side availability", () => {
    const source = readFileSync("lib/reservations/availability.ts", "utf8");

    expect(source).toContain("isReservationTimeInPastNewYork(input.reservation_date, startTime)");
    expect(source).toContain("Please choose a future reservation time.");
  });
});
