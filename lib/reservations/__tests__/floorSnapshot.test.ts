import { describe, expect, it } from "vitest";
import { canTransitionReservationStatus } from "../ui";
import { getAssignedReservationResourceLabel, getFloorSnapshotState, hasAssignedReservationResource, resourceAssignmentPayload, resourceName } from "../floorSnapshot";
import { getReserveVocabulary } from "../reserveVocabulary";
import { getReserveActionLinks } from "../reserveLinks";

describe("reservation resource assignment helpers", () => {
  it("treats bookable item ids and names as assignments", () => {
    expect(hasAssignedReservationResource({ id: "r1", bookable_item_id: "b1" })).toBe(true);
    expect(hasAssignedReservationResource({ id: "r2", bookable_item_name: "Booth 2" })).toBe(true);
    expect(getAssignedReservationResourceLabel({ id: "r2", bookable_item_name: "Booth 2" })).toBe("Booth 2");
  });

  it("sends a visible card label for resource_label", () => {
    expect(resourceAssignmentPayload({ id: "fallback-id", label: "Table 7", item_type: "table" })).toMatchObject({
      resource_id: "fallback-id",
      resource_label: "Table 7",
      resource_type: "table",
    });
  });

  it("uses item_name before any in-memory label for layout resources", () => {
    const resource = { id: "table-2", item_name: "Table 2", label: "Legacy label", item_type: "table", capacity: 4 };
    expect(resourceName(resource)).toBe("Table 2");
    expect(resourceAssignmentPayload(resource)).toEqual({
      resource_id: "table-2",
      resource_source: "layout_items",
      resource_table: "layout_items",
      resource_label: "Table 2",
      resource_type: "table",
      resource_capacity: 4,
    });
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
    const uuid = "123e4567-e89b-12d3-a456-426614174000";
    const state = getFloorSnapshotState({ id: uuid, label: "Table 1" }, [{ id: "r1", status: "seated", bookable_item_id: uuid }]);
    expect(state.status).toBe("Seated");
    expect(state.available).toBe(false);
  });

  it("matches reservations by normalized bookable item name fallback", () => {
    const state = getFloorSnapshotState({ id: "table-1", item_name: "Table 1" }, [{ id: "r1", status: "seated", bookable_item_name: " table   1 " }]);
    expect(state.status).toBe("Seated");
    expect(state.available).toBe(false);
  });

  it("matches label-only assignments to resource item_name when bookable_item_id is null", () => {
    const state = getFloorSnapshotState({ id: "synthetic-1", item_name: "Table 1" }, [{ id: "r1", status: "checked_in", bookable_item_id: null, bookable_item_name: "Table 1" }]);
    expect(state.status).toBe("Waiting");
    expect(state.available).toBe(false);
  });

  it("does not let completed reservations block the floor card", () => {
    const state = getFloorSnapshotState({ id: "table-1", item_name: "Table 1" }, [{ id: "r1", status: "completed", bookable_item_id: "table-1", bookable_item_name: "Table 1" }]);
    expect(state.status).toBe("Open");
    expect(state.available).toBe(true);
  });
});


describe("floor snapshot status priority", () => {
  it("keeps seated ahead of arrived for the same label-only resource", () => {
    const state = getFloorSnapshotState({ id: "demo", item_name: "Demo Table" }, [
      { id: "older", status: "arrived", bookable_item_id: null, bookable_item_name: "demo table", reservation_time: "18:00" },
      { id: "newer", status: "seated", bookable_item_id: null, bookable_item_name: "demo table", reservation_time: "18:05" },
    ]);
    expect(state.status).toBe("Seated");
    expect(state.reservation?.id).toBe("newer");
  });

  it("shows ready sent only after seated loses priority", () => {
    const state = getFloorSnapshotState({ item_name: "Lane 1" }, [
      { id: "ready", status: "checked_in", bookable_item_name: "Lane 1", table_ready_sms_sent: true } as any,
    ]);
    expect(state.status).toBe("Ready sent");
  });
});

describe("reserve vocabulary", () => {
  it("returns restaurant labels", () => {
    expect(getReserveVocabulary("restaurant")).toMatchObject({ assignResource: "Assign table", seatAction: "Seat guest", seatedStatus: "Seated" });
  });

  it("returns bowling labels", () => {
    expect(getReserveVocabulary("bowling")).toMatchObject({ assignResource: "Assign lane", seatAction: "Start lane", seatedStatus: "In lane" });
  });

  it("returns karaoke labels", () => {
    expect(getReserveVocabulary("karaoke")).toMatchObject({ assignResource: "Assign room", seatAction: "Start room", seatedStatus: "In room" });
  });

  it("returns generic labels by default", () => {
    expect(getReserveVocabulary()).toMatchObject({ assignResource: "Assign space", seatAction: "Mark in place", seatedStatus: "In place" });
  });

  it("uses item type when the location type is generic", () => {
    expect(getReserveVocabulary("location", "lane")).toMatchObject({ assignResource: "Assign lane", seatedStatus: "In lane" });
  });
});

describe("reserve action links", () => {
  it("does not force restaurant type for activity locations", () => {
    const links = getReserveActionLinks({ locationId: "loc_123", locationType: "activity" });
    expect(links.bookingHref).toBe("/reserve/location/loc_123?type=activity");
    expect(links.embedHref).toBe("/embed/reservations/loc_123?type=activity");
  });

  it("omits type when it is unknown", () => {
    const links = getReserveActionLinks({ locationId: "loc_123" });
    expect(links.bookingHref).toBe("/reserve/location/loc_123");
  });

  it("normalizes Reserve QR links to the command center instead of claim QR admin pages", () => {
    const links = getReserveActionLinks({ locationId: "loc_123", locationType: "restaurant" });
    expect(links.qrHref).toBe("/reserve/dashboard?locationId=loc_123&type=restaurant&tab=settings&section=qr");
    expect(links.qrHref).not.toContain("claim-qrs");
  });
});
