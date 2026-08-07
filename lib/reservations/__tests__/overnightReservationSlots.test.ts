import { describe, expect, it } from "vitest";
import {
  getOperatingHoursForDate,
  timeWindowToSlots,
} from "@/lib/locationHours";

describe("reservation slot generation across midnight", () => {
  it("treats midnight as the following day", () => {
    const slots = timeWindowToSlots(
      [{ open: "09:00", close: "00:00" }],
      90,
      30,
    );

    expect(slots[0]).toBe("09:00");
    expect(slots).toContain("22:30");
    expect(slots).not.toContain("00:00");
    expect(slots.length).toBeGreaterThan(1);
  });

  it("supports overnight hours while keeping slot starts on the selected date", () => {
    const slots = timeWindowToSlots(
      [{ open: "18:00", close: "02:00" }],
      90,
      30,
    );

    expect(slots[0]).toBe("18:00");
    expect(slots).toContain("23:30");
    expect(slots).not.toContain("00:00");
  });

  it("preserves normal same-day windows", () => {
    expect(
      timeWindowToSlots([{ open: "10:00", close: "13:00" }], 90, 30),
    ).toEqual(["10:00", "10:30", "11:00", "11:30"]);
  });

  it("parses the nested ranges schema used by production locations", () => {
    const windows = getOperatingHoursForDate(
      {
        operating_hours: {
          wednesday: {
            closed: false,
            ranges: [{ open: "09:00", close: "00:00" }],
          },
        },
      },
      "2026-08-12",
    );

    expect(windows).toEqual([{ open: "09:00", close: "00:00" }]);
    expect(timeWindowToSlots(windows || [], 90, 30)).toContain("22:30");
  });

  it("keeps nested closed days closed", () => {
    const windows = getOperatingHoursForDate(
      {
        operating_hours: {
          wednesday: {
            closed: true,
            ranges: [{ open: "09:00", close: "00:00" }],
          },
        },
      },
      "2026-08-12",
    );

    expect(windows).toEqual([]);
  });
});
