import { describe, expect, it } from "vitest";
import { canTransitionReservationStatus, getReservationStatusLabel } from "@/lib/reservations/ui";
import { getReserveBookingUrl, getReserveDashboardUrl, getReserveEmbedUrl } from "@/lib/reservations/reserveLinks";
import { dedupeFloorResources, getFloorSnapshotState, resourceId } from "@/lib/reservations/floorSnapshot";

describe("Reserve Command Center helpers", () => {
  it("allows Guest arrived reservations to be seated", () => {
    expect(getReservationStatusLabel("checked_in")).toBe("Guest arrived");
    expect(getReservationStatusLabel("seated")).toBe("Seated now");
    expect(canTransitionReservationStatus("checked_in", "seated")).toBe(true);
  });

  it("builds dashboard, booking, and embed links", () => {
    expect(getReserveDashboardUrl("settings", "embed")).toBe("/reserve/dashboard?tab=settings&section=embed");
    expect(getReserveBookingUrl("loc_123", "restaurant")).toBe("/reserve/restaurant/loc_123");
    expect(getReserveEmbedUrl("loc_123")).toBe("/embed/reservations/loc_123");
  });

  it("deduplicates accidental duplicate floor resources by name, capacity, and type", () => {
    const resources = dedupeFloorResources([
      { id: "layout-table-1", label: "Table 1", item_type: "table", capacity: 2 },
      { id: "bookable-table-1", item_name: "Table 1", item_type: "table", capacity: 2 },
      { id: "table-2", label: "Table 2", item_type: "table", capacity: 4 },
    ]);
    expect(resources).toHaveLength(2);
  });

  it("uses canonical resource ids and marks seated reservations unavailable", () => {
    const resource = { layout_item_id: "layout-table-1", label: "Table 1", capacity: 2 };
    expect(resourceId(resource)).toBe("layout-table-1");
    expect(getFloorSnapshotState(resource, [{ id: "res-1", status: "seated", assigned_resource_id: "layout-table-1" }])).toMatchObject({
      status: "Seated",
      available: false,
    });
    expect(getFloorSnapshotState(resource, [{ id: "res-1", status: "completed", assigned_resource_id: "layout-table-1" }])).toMatchObject({
      status: "Open",
      available: true,
    });
  });
});
