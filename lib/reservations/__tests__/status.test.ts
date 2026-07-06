import { describe, expect, it } from "vitest";
import { canTransitionReservationStatus, getNextReservationActions, getReservationStatusLabel, normalizeReservationStatus } from "../status";

describe("canonical Reserve status helpers", () => {
  it("normalizes legacy and raw reservation statuses for the UI", () => {
    expect(normalizeReservationStatus("arrived")).toBe("checked_in");
    expect(normalizeReservationStatus("reservation")).toBe("pending");
    expect(normalizeReservationStatus("occupied")).toBe("seated");
    expect(getReservationStatusLabel("arrived")).toBe("Waiting");
  });

  it("allows host action transitions without making check-in mean seated", () => {
    expect(canTransitionReservationStatus("confirmed", "checked_in")).toBe(true);
    expect(canTransitionReservationStatus("checked_in", "seated")).toBe(true);
    expect(canTransitionReservationStatus("seated", "completed")).toBe(true);
    expect(canTransitionReservationStatus("confirmed", "completed")).toBe(false);
  });

  it("exposes a single complete action and seating actions", () => {
    expect(getNextReservationActions({ status: "confirmed" }).map((a) => a.key)).toEqual(expect.arrayContaining(["check_in", "seat", "cancel", "no_show"]));
    const seatedActions = getNextReservationActions({ status: "seated" });
    expect(seatedActions.filter((a) => a.key === "complete")).toHaveLength(1);
    expect(seatedActions.find((a) => a.key === "complete")?.targetStatus).toBe("completed");
  });
});
