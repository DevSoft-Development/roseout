import { describe, expect, it } from "vitest";
import {
  buildPacingBuckets,
  hostAttentionItems,
  pacingWarnings,
  rankResourcesForReservation,
  rankStaffForParty,
  tableTurnState,
} from "../enterpriseHost";

describe("Reserve enterprise host helpers", () => {
  it("builds cover pacing buckets and warnings", () => {
    const reservations = [
      { id: "1", status: "confirmed", reservation_time: "18:01", party_size: 4 },
      { id: "2", status: "confirmed", reservation_time: "18:12", party_size: 6 },
      { id: "3", status: "cancelled", reservation_time: "18:08", party_size: 20 },
    ];
    expect(buildPacingBuckets(reservations)).toEqual([
      { startMinute: 1080, reservations: 2, covers: 10 },
    ]);
    expect(pacingWarnings(reservations, { max_covers_15m: 8 })).toMatchObject([
      { startMinute: 1080, windowMinutes: 15, covers: 10, limit: 8 },
    ]);
  });

  it("marks overdue seated tables for attention", () => {
    const now = new Date("2026-09-03T19:00:00-04:00").getTime();
    const reservation = {
      id: "r1",
      status: "seated",
      seated_at: "2026-09-03T17:00:00-04:00",
      duration_minutes: 90,
      bookable_item_name: "T12",
    };
    expect(tableTurnState(reservation, now)).toMatchObject({
      elapsedMinutes: 120,
      expectedMinutes: 90,
      remainingMinutes: -30,
      state: "overdue",
    });
    expect(hostAttentionItems([reservation], now)[0]?.message).toContain("30 minutes over");
  });

  it("balances staff by actual covers and recent seating pressure", () => {
    const now = new Date("2026-09-03T18:00:00-04:00").getTime();
    const staff = [
      { id: "sarah", display_name: "Sarah", status: "active" },
      { id: "michael", display_name: "Michael", status: "active" },
    ];
    const reservations = [
      { id: "a", status: "seated", party_size: 8, server_staff_profile_id: "sarah", seated_at: "2026-09-03T17:55:00-04:00" },
      { id: "b", status: "seated", party_size: 2, server_staff_profile_id: "michael", seated_at: "2026-09-03T17:20:00-04:00" },
    ];
    expect(rankStaffForParty(4, staff, reservations, { now })[0]?.staff.id).toBe("michael");
  });

  it("prefers the smallest sensible available table", () => {
    const ranking = rankResourcesForReservation(
      { id: "r", party_size: 4 },
      [
        { id: "t8", item_name: "T8", item_type: "table", capacity: 8 },
        { id: "t4", item_name: "T4", item_type: "table", capacity: 4 },
        { id: "t2", item_name: "T2", item_type: "table", capacity: 2 },
      ],
    );
    expect(ranking[0]?.label).toBe("T4");
    expect(ranking.at(-1)?.label).toBe("T2");
  });
});
