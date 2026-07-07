import { describe, expect, it } from "vitest";
import {
  canTransitionReservationStatus,
  getReservationStatusLabel,
} from "@/lib/reservations/ui";
import {
  getReserveActionLinks,
  getReserveBookingUrl,
  getReserveDashboardUrl,
  getReserveEmbedUrl,
  getReserveLocationBookingUrl,
} from "@/lib/reservations/reserveLinks";
import {
  dedupeFloorResources,
  getFloorSnapshotState,
  resourceAssignmentPayload,
  resourceId,
  resourceSource,
} from "@/lib/reservations/floorSnapshot";

describe("Reserve Command Center helpers", () => {
  it("allows Guest arrived reservations to be seated", () => {
    expect(getReservationStatusLabel("checked_in")).toBe("Guest arrived");
    expect(getReservationStatusLabel("seated")).toBe("Seated now");
    expect(canTransitionReservationStatus("checked_in", "seated")).toBe(true);
  });

  it("builds dashboard, booking, and embed links", () => {
    expect(getReserveDashboardUrl("settings", "embed")).toBe(
      "/reserve/dashboard?tab=settings&section=embed",
    );
    expect(getReserveBookingUrl("loc_123", "restaurant")).toBe(
      "/reserve/location/loc_123?type=restaurant",
    );
    expect(getReserveLocationBookingUrl("loc_123", "restaurant")).toBe(
      "/reserve/location/loc_123?type=restaurant",
    );
    expect(getReserveEmbedUrl("loc_123")).toBe("/embed/reservations/loc_123");
    expect(
      getReserveActionLinks({
        locationId: "loc_123",
        locationType: "restaurant",
        adminLocationId: "loc_123",
      }),
    ).toMatchObject({
      bookingHref: "/reserve/location/loc_123?type=restaurant",
      embedHref: "/embed/reservations/loc_123?type=restaurant",
      qrHref:
  "/reserve/dashboard?locationId=loc_123&type=restaurant&tab=settings&section=qr",
    });
  });

  it("deduplicates accidental duplicate floor resources by name, capacity, and type", () => {
    const resources = dedupeFloorResources([
      {
        id: "layout-table-1",
        label: "Table 1",
        item_type: "table",
        capacity: 2,
      },
      {
        id: "bookable-table-1",
        item_name: "Table 1",
        item_type: "table",
        capacity: 2,
      },
      { id: "table-2", label: "Table 2", item_type: "table", capacity: 4 },
    ]);
    expect(resources).toHaveLength(2);
  });

  it("supports all floor snapshot resource id and source shapes", () => {
    expect(resourceId({ id: "plain-id" })).toBe("plain-id");
    expect(resourceId({ layout_item_id: "layout-id" })).toBe("layout-id");
    expect(resourceId({ bookable_item_id: "bookable-id" })).toBe("bookable-id");
    expect(resourceId({ resource_id: "resource-id" })).toBe("resource-id");

    expect(resourceSource({ layout_item_id: "layout-id" })).toBe(
      "layout_items",
    );
    expect(resourceSource({ bookable_item_id: "bookable-id" })).toBe(
      "location_bookable_items",
    );
    expect(
      resourceSource({
        id: "bookable-id",
        resource_source: "location_bookable_items",
      }),
    ).toBe("location_bookable_items");
  });

  it("builds assignment payloads with id, source, label, type, and capacity", () => {
    expect(
      resourceAssignmentPayload({
        bookable_item_id: "bookable-id",
        item_name: "Patio Booth",
        item_type: "booth",
      }),
    ).toEqual({
      resource_id: "bookable-id",
      resource_source: "location_bookable_items",
      resource_table: "location_bookable_items",
      resource_label: "Patio Booth",
      resource_type: "booth",
      resource_capacity: undefined,
    });

    expect(
      resourceAssignmentPayload({
        layout_item_id: "layout-id",
        item_name: "Table 7",
        item_type: "table",
        capacity: 4,
      }),
    ).toEqual({
      resource_id: "layout-id",
      resource_source: "layout_items",
      resource_table: "layout_items",
      resource_label: "Table 7",
      resource_type: "table",
      resource_capacity: 4,
    });
  });

  it("uses canonical resource ids and marks seated reservations unavailable", () => {
    const resource = {
      layout_item_id: "layout-table-1",
      label: "Table 1",
      capacity: 2,
    };
    expect(resourceId(resource)).toBe("layout-table-1");
    expect(
      getFloorSnapshotState(resource, [
        { id: "res-1", status: "seated", bookable_item_name: "Table 1" },
      ]),
    ).toMatchObject({
      status: "Seated",
      available: false,
    });
    expect(
      getFloorSnapshotState(resource, [
        { id: "res-1", status: "completed", bookable_item_name: "Table 1" },
      ]),
    ).toMatchObject({
      status: "Open",
      available: true,
    });
  });
});

describe("Reserve Command Center layout routing", () => {
  it("routes layout links inside settings", () => {
    expect(
      getReserveDashboardUrl("settings", "layout", {
        adminLocationId: "loc_123",
        type: "restaurant",
      }),
    ).toBe(
      "/reserve/dashboard?adminLocationId=loc_123&type=restaurant&tab=settings&section=layout",
    );
  });
});
