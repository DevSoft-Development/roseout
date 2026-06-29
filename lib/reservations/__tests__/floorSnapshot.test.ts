import { describe, expect, it } from "vitest";
import { canTransitionReservationStatus } from "../ui";
import { getAssignedReservationResourceLabel, getFloorSnapshotState, hasAssignedReservationResource } from "../floorSnapshot";

describe("reservation resource assignment helpers", () => {
  it("treats an assigned resource label as an assignment", () => {
    expect(hasAssignedReservationResource({ id: "r1", assigned_resource_label: "Table 1" })).toBe(true);
    expect(getAssignedReservationResourceLabel({ id: "r1", assigned_resource_label: "Table 1" })).toBe("Table 1");
  });

  it("treats bookable item ids and names as assignments", () => {
    expect(hasAssignedReservationResource({ id: "r1", bookable_item_id: "b1" })).toBe(true);
    expect(hasAssignedReservationResource({ id: "r2", bookable_item_name: "Booth 2" })).toBe(true);
    expect(getAssignedReservationResourceLabel({ id: "r2", bookable_item_name: "Booth 2" })).toBe("Booth 2");
  });

  it("uses newer table and resource label fields as assignments", () => {
    expect(hasAssignedReservationResource({ id: "r1", assigned_table_name: "Table 7" } as any)).toBe(true);
    expect(hasAssignedReservationResource({ id: "r2", resource_label: "Patio" } as any)).toBe(true);
    expect(getAssignedReservationResourceLabel({ id: "r1", assigned_table_name: "Table 7" } as any)).toBe("Table 7");
    expect(getAssignedReservationResourceLabel({ id: "r2", resource_label: "Patio" } as any)).toBe("Patio");
  });

  it("returns false and Unassigned when no known assignment fields exist", () => {
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
  it("matches reservations by assigned id", () => {
    const state = getFloorSnapshotState({ id: "table-1", label: "Table 1" }, [{ id: "r1", status: "seated", assigned_resource_id: "table-1" }]);
    expect(state.status).toBe("Seated");
    expect(state.available).toBe(false);
  });

  it("matches reservations by normalized assigned label fallback", () => {
    const state = getFloorSnapshotState({ id: "table-1", label: "Table 1" }, [{ id: "r1", status: "seated", assigned_resource_label: " table   1 " }]);
    expect(state.status).toBe("Seated");
    expect(state.available).toBe(false);
  });
});
