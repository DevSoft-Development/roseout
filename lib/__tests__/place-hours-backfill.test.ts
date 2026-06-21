import { describe, expect, it } from "vitest";
import { canAutomatedProfileUpdateWrite, isBlankHoursValue, isClaimedLocation } from "@/lib/google/place-hours-backfill";

describe("place-hours-backfill profile protections", () => {
  it("treats empty and fake operating_hours values as blank repair targets", () => {
    expect(isBlankHoursValue(null)).toBe(true);
    expect(isBlankHoursValue({})).toBe(true);
    expect(isBlankHoursValue([])).toBe(true);
    expect(isBlankHoursValue("null")).toBe(true);
    expect(isBlankHoursValue("{}" )).toBe(true);
    expect(isBlankHoursValue({ monday: "9am-5pm" })).toBe(true);
    expect(isBlankHoursValue({ Monday: "9am-5pm" })).toBe(true);
  });

  it("does not treat real operating_hours as blank", () => {
    expect(isBlankHoursValue({ monday: ["9:00 AM - 5:00 PM"] })).toBe(false);
  });

  it("blocks automated overwrites for owner/admin/manual locked profiles", () => {
    expect(canAutomatedProfileUpdateWrite({ id: "1", profile_managed_by: "owner" }, "phone")).toBe(false);
    expect(canAutomatedProfileUpdateWrite({ id: "2", profile_managed_by: "admin" }, "website")).toBe(false);
    expect(canAutomatedProfileUpdateWrite({ id: "3", profile_manual_lock: true }, "operating_hours")).toBe(false);
  });

  it("allows automated fills for unmanaged profiles", () => {
    expect(canAutomatedProfileUpdateWrite({ id: "4", profile_managed_by: "google", profile_manual_lock: false }, "phone")).toBe(true);
  });

  it("detects claimed locations from existing claim fields", () => {
    expect(isClaimedLocation({ is_claimed: true })).toBe(true);
    expect(isClaimedLocation({ claimed: true })).toBe(true);
    expect(isClaimedLocation({ claim_status: "approved" })).toBe(true);
    expect(isClaimedLocation({ claim_status: "pending" })).toBe(false);
  });
});
