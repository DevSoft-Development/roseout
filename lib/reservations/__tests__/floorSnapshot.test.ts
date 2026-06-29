import { describe, expect, it } from "vitest";
import { canTransitionReservationStatus } from "../ui";
import { getAssignedReservationResourceLabel, getFloorSnapshotState, hasAssignedReservationResource } from "../floorSnapshot";

describe("reservation resource assignment helpers", () => {
  it("treats bookable item ids and names as assignments", () => {
    expect(hasAssignedReservationResource({ id: "r1", bookable_item_id: "b1" })).toBe(true);
    expect(hasAssignedReservationResource({ id: "r2", bookable_item_name: "Booth 2" })).toBe(true);
    expect(getAssignedReservationResourceLabel({ id: "r2", bookable_item_name: "Booth 2" })).toBe("Booth 2");
  });

  it("uses in-memory legacy labels only as a defensive fallback", () => {
    expect(hasAssignedReservationResource({ id: "r1", assigned_resource_label: "Table 1" })).toBe(true);
    expect(getAssignedReservationResourceLabel({ id: "r1", assigned_resource_label: "Table 1" })).toBe("Table 1");
  });

  it("prefers bookable item names over in-memory legacy labels", () => {
    expect(getAssignedReservationResourceLabel({ id: "r1", bookable_item_name: "Table 2", assigned_resource_label: "Table 1" })).toBe("Table 2");
  });

  it("returns false and Unassigned when no current assignment fields exist", () => {
    expect(hasAssignedReservationResource({ id: "r1" })).toBe(false);
    expect(getAssignedReservationResourceLabel({ id: "r1" })).toBe("Unassigned");
  });
});

describe("reservation status transitions", () => {
  it("allows checked-in and legacy arrived reservations to be seated", () => {
    expect(canTransitionReservationStatus("checked_in", "seated")).toBe(true);
    expect(canTransitionReservationStatus("arrived", "seated")).toBe(true);
  });

  it("allows seated reservations to be completed", () => {
    expect(canTransitionReservationStatus("seated", "completed")).toBe(true);
  });
});

describe("floor snapshot reservation matching", () => {
  it("matches reservations by bookable item id", () => {
    const state = getFloorSnapshotState({ id: "table-1", label: "Table 1" }, [{ id: "r1", status: "seated", bookable_item_id: "table-1" }]);
    expect(state.status).toBe("Seated");
    expect(state.available).toBe(false);
  });

  it("matches reservations by normalized bookable item name fallback", () => {
    const state = getFloorSnapshotState({ id: "table-1", label: "Table 1" }, [{ id: "r1", status: "seated", bookable_item_name: " table   1 " }]);
    expect(state.status).toBe("Seated");
    expect(state.available).toBe(false);
  });
});
