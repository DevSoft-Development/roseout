import { describe, expect, it } from "vitest";
import { canTransitionReservationStatus, getReservationStatusLabel } from "@/lib/reservations/ui";
import { getReserveBookingUrl, getReserveDashboardUrl, getReserveEmbedUrl } from "@/lib/reservations/reserveLinks";
import { dedupeFloorResources } from "@/lib/reservations/floorSnapshot";

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

  it("deduplicates floor resources by stable id", () => {
    const resources = dedupeFloorResources([
      { id: "table-1", label: "Table 1", capacity: 2 },
      { id: "table-1", label: "Table 1", capacity: 2 },
      { id: "table-2", label: "Table 2", capacity: 4 },
    ]);
    expect(resources).toHaveLength(2);
  });
});
