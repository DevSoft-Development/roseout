import { describe, expect, it } from "vitest";
import { humanTextToOperatingHoursJson, normalizeTimeRange, operatingHoursJsonToHumanText, validateHumanHoursText } from "../location-hours";
import { getLocationHoursDisplay, normalizeWeeklyHoursForDisplay } from "../locationHours";

describe("location hours helpers", () => {
  it("converts operating_hours JSON to human weekly text", () => {
    expect(operatingHoursJsonToHumanText({ monday: ["11:30 AM - 10:00 PM"], tuesday: ["11:30 AM - 10:00 PM"] })).toContain("Monday - 11:30 AM - 10:00 PM");
  });

  it("converts human weekly text to operating_hours JSON", () => {
    expect(humanTextToOperatingHoursJson("Monday - 8:30 AM - 10:30 PM\nTuesday - 8:30 AM - 10:30 PM")).toEqual({ monday: ["8:30 AM - 10:30 PM"], tuesday: ["8:30 AM - 10:30 PM"] });
  });

  it("normalizes compact ranges", () => {
    expect(normalizeTimeRange("8:30am-10:30pm")).toBe("8:30 AM - 10:30 PM");
    expect(normalizeTimeRange("11am - 9pm")).toBe("11:00 AM - 9:00 PM");
  });

  it("saves closed days as empty arrays", () => {
    expect(humanTextToOperatingHoursJson("Sunday - Closed")).toEqual({ sunday: [] });
  });

  it("supports multiple periods per day", () => {
    expect(humanTextToOperatingHoursJson("Monday - 9:00 AM - 2:00 PM, 5:00 PM - 10:00 PM")).toEqual({ monday: ["9:00 AM - 2:00 PM", "5:00 PM - 10:00 PM"] });
  });

  it("returns invalid line warnings", () => {
    const validation = validateHumanHoursText("Monday - 8:30 - 10:30");
    expect(validation.valid).toBe(false);
    expect(validation.errors[0]?.message).toContain("Line 1 could not be understood");
  });

  it("normalizes public display hours without raw semicolon output", () => {
    const week = normalizeWeeklyHoursForDisplay({ Friday: ["11:30 AM - 10:30 PM"], monday: "11:30 AM - 10:00 PM" });
    expect(week.friday).toEqual(["11:30 AM - 10:30 PM"]);
    expect(week.monday).toEqual(["11:30 AM - 10:00 PM"]);
  });

  it("calculates public open, opening-soon, split, invalid, and overnight statuses", () => {
    expect(getLocationHoursDisplay({ operating_hours: { friday: ["8:00 PM - 2:00 AM"] }, timezone: "UTC" }, new Date("2026-06-20T01:00:00Z")).statusText).toBe("Open now · Closes at 2:00 AM");
    expect(getLocationHoursDisplay({ operating_hours: { sunday: ["11:30 AM - 9:00 PM"] }, timezone: "UTC" }, new Date("2026-06-21T10:45:00Z")).statusText).toBe("Closed now · Opens in 45 minutes");
    expect(getLocationHoursDisplay({ operating_hours: { sunday: ["9:00 AM - 2:00 PM", "5:00 PM - 10:00 PM"] }, timezone: "UTC" }, new Date("2026-06-21T18:00:00Z")).statusText).toBe("Open now · Closes at 10:00 PM");
    expect(getLocationHoursDisplay({ operating_hours: { sunday: ["brunch until late"] }, timezone: "UTC" }, new Date("2026-06-21T18:00:00Z")).statusText).toBe("Hours listed below");
  });
});
