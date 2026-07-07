import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateQuarterHourOptions,
  getNextFutureQuarterTime,
  normalizeReservationFormDateTime,
} from "../timeSlots";

function freeze(value: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(value));
}

describe("reservation time slots", () => {
  afterEach(() => vi.useRealTimers());

  it("rounds 7:06 PM to 7:15 PM", () => {
    freeze("2026-07-06T23:06:00Z");
    expect(getNextFutureQuarterTime("America/New_York")).toBe("19:15");
  });

  it("rounds 7:15 PM to 7:30 PM", () => {
    freeze("2026-07-06T23:15:00Z");
    expect(getNextFutureQuarterTime("America/New_York")).toBe("19:30");
  });

  it("excludes past times for today", () => {
    freeze("2026-07-06T23:06:00Z");
    const values = generateQuarterHourOptions({ selectedDate: "2026-07-06", timeZone: "America/New_York" }).map((slot) => slot.value);
    expect(values).not.toContain("19:00");
    expect(values[0]).toBe("19:15");
  });

  it("includes normal 15-minute increments for a future date", () => {
    freeze("2026-07-06T23:06:00Z");
    const values = generateQuarterHourOptions({ selectedDate: "2026-07-07", timeZone: "America/New_York" }).slice(0, 4).map((slot) => slot.value);
    expect(values).toEqual(["00:00", "00:15", "00:30", "00:45"]);
  });

  it("clamps a past date to today", () => {
    freeze("2026-07-06T23:06:00Z");
    expect(normalizeReservationFormDateTime({ reservationDate: "2026-07-05", reservationTime: "12:00", timeZone: "America/New_York" })).toEqual({ reservationDate: "2026-07-06", reservationTime: "19:15" });
  });

  it("clamps a past time today to next future quarter", () => {
    freeze("2026-07-06T23:06:00Z");
    expect(normalizeReservationFormDateTime({ reservationDate: "2026-07-06", reservationTime: "19:00", timeZone: "America/New_York" }).reservationTime).toBe("19:15");
  });
});
