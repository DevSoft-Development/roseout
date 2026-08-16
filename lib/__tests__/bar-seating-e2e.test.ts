import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getFloorSnapshotState } from "@/lib/reservations/floorSnapshot";

const migration = readFileSync(
  "supabase/migrations/20260816130000_reserve_bar_seating_e2e.sql",
  "utf8",
);
const floor = readFileSync("components/reserve/ReserveFloorSnapshot.tsx", "utf8");

describe("Reserve bar seating E2E", () => {
  it("materializes seat resources from a bar/counter layout container", () => {
    expect(migration).toContain("reservation_seating_resources");
    expect(migration).toContain("reserve_sync_bar_seats_trigger");
    expect(migration).toContain("seat_index");
    expect(migration).toContain("capacity = 1");
  });

  it("stores multiple resources per reservation and enforces adjacent availability", () => {
    expect(migration).toContain("reservation_resource_assignments");
    expect(migration).toContain("candidate_start + party - 1");
    expect(migration).toContain("There are not enough adjacent bar seats available");
    expect(migration).toContain("overlap_count");
  });

  it("releases bar assignments for terminal reservation states", () => {
    for (const status of ["completed", "cancelled", "declined", "no_show"]) {
      expect(migration).toContain(status);
    }
    expect(migration).toContain("delete from public.reservation_resource_assignments where reservation_id = new.id");
    expect(migration).toContain("reserve_release_assignments_delete_trigger");
  });

  it("renders bar stools separately from table chairs", () => {
    expect(floor).toContain("function BarDiagram");
    expect(floor).toContain("individual bar seats");
    expect(floor).toContain("Tap a stool to assign");
    expect(floor).toContain("bar_seat");
    expect(floor).toContain("counter_seat");
  });

  it("marks every seat in a multi-seat reservation unavailable", () => {
    const reservation = {
      id: "reservation-1",
      status: "seated",
      bookable_item_type: "bar_seat",
      bookable_item_name: "Main Bar Seat 2, Main Bar Seat 3, Main Bar Seat 4",
    };
    expect(
      getFloorSnapshotState({ item_name: "Main Bar Seat 2", item_type: "bar_seat" }, [reservation]).status,
    ).toBe("Seated");
    expect(
      getFloorSnapshotState({ item_name: "Main Bar Seat 3", item_type: "bar_seat" }, [reservation]).available,
    ).toBe(false);
    expect(
      getFloorSnapshotState({ item_name: "Main Bar Seat 5", item_type: "bar_seat" }, [reservation]).available,
    ).toBe(true);
  });
});
