import { describe, expect, it } from "vitest";
import { timeWindowToSlots } from "@/lib/locationHours";

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
});
