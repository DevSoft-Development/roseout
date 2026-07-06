import { describe, expect, it, vi } from "vitest";
import { formatReservationDateTime } from "../reservationFormatting";
import { reservationNeedsAction } from "../metrics";
import {
  canAssignReservationResource,
  canSeatReservation,
  getNextReservationActions,
  isTerminalReservationStatus,
} from "../status";

function activeActionKeys(status: string, assigned = false) {
  return getNextReservationActions({
    status,
    bookable_item_id: assigned ? "table-1" : null,
  }).map((action) => action.key);
}

describe("Reserve command center action flow", () => {
  it("formats ISO booked timestamps into local readable date-times", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-06T20:00:00.000Z"));

    expect(formatReservationDateTime("2026-07-06T23:06:12.752944+00:00", "America/New_York")).toBe("Today at 7:06 PM");
    expect(formatReservationDateTime("2026-07-05T23:06:12.752944+00:00", "America/New_York")).toBe("Jul 5, 2026, 7:06 PM");
    expect(formatReservationDateTime(null)).toBe("—");
    expect(formatReservationDateTime("not-a-date")).toBe("—");

    vi.useRealTimers();
  });

  it("keeps pending reservations to confirm-only workflow actions", () => {
    expect(activeActionKeys("pending")).toContain("confirm");
    expect(canAssignReservationResource("pending")).toBe(false);
    expect(canSeatReservation("pending")).toBe(false);
    expect(activeActionKeys("pending")).not.toContain("seat");
  });

  it("shows check-in for confirmed reservations without assign or seat eligibility", () => {
    expect(activeActionKeys("confirmed")).toContain("check_in");
    expect(activeActionKeys("confirmed")).not.toContain("seat");
    expect(canAssignReservationResource("confirmed")).toBe(false);
    expect(canSeatReservation("confirmed")).toBe(false);
  });

  it("allows checked-in reservations to be assigned and seated only after assignment", () => {
    expect(canAssignReservationResource("checked_in")).toBe(true);
    expect(canSeatReservation("checked_in")).toBe(true);
    expect(activeActionKeys("checked_in", false)).toContain("seat");
    expect(activeActionKeys("checked_in", true)).toContain("seat");
  });

  it("does not expose active workflow actions for terminal reservations", () => {
    for (const status of ["completed", "cancelled", "no_show", "declined"]) {
      expect(isTerminalReservationStatus(status)).toBe(true);
      expect(activeActionKeys(status)).toEqual([]);
      expect(canAssignReservationResource(status)).toBe(false);
      expect(canSeatReservation(status)).toBe(false);
    }
  });
});

describe("Reserve command center needs-action metric", () => {
  it("includes pending, confirmed, and checked-in arrivals without an assigned resource", () => {
    expect(reservationNeedsAction({ status: "pending" })).toBe(true);
    expect(reservationNeedsAction({ status: "confirmed" })).toBe(true);
    expect(reservationNeedsAction({ status: "checked_in" })).toBe(true);
    expect(reservationNeedsAction({ status: "waiting" })).toBe(true);
    expect(reservationNeedsAction({ status: "arrived" })).toBe(true);
  });

  it("excludes seated, terminal statuses, and checked-in reservations with a resource", () => {
    expect(reservationNeedsAction({ status: "seated" })).toBe(false);
    expect(reservationNeedsAction({ status: "completed" })).toBe(false);
    expect(reservationNeedsAction({ status: "cancelled" })).toBe(false);
    expect(reservationNeedsAction({ status: "no_show" })).toBe(false);
    expect(reservationNeedsAction({ status: "checked_in", bookable_item_id: "table-1" })).toBe(false);
  });
});
