import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("app/api/reserve/location/route.ts", "utf8");

describe("reservation reschedule replacement contract", () => {
  it("validates the management token and reservation lifecycle before rescheduling", () => {
    expect(source).toContain("rescheduleToken");
    expect(source).toContain("customer_token");
    expect(source).toContain("customer_token_expires_at");
    expect(source).toContain("canModifyReservation(existing.status)");
    expect(source).toContain("This reschedule link does not belong to this location.");
  });

  it("excludes the original reservation from availability and item overlap checks", () => {
    expect(source).toContain("exclude_reservation_id: rescheduledFrom?.id || undefined");
    expect(source).toContain('existingReservationsQuery.neq("id", rescheduledFrom.id)');
  });

  it("creates the replacement before retiring the original reservation", () => {
    const insertIndex = source.indexOf('.from("location_reservations")\n      .insert({');
    const cancelIndex = source.indexOf('status: "cancelled"', insertIndex);
    expect(insertIndex).toBeGreaterThan(-1);
    expect(cancelIndex).toBeGreaterThan(insertIndex);
    expect(source).toContain('source: rescheduledFrom ? "theouthaven_reschedule" : "theouthaven"');
  });

  it("compensates if the original reservation cannot be retired", () => {
    expect(source).toContain("cancelOriginalError");
    expect(source).toContain('from("reservation_reminders")');
    expect(source).toContain('from("location_reservations")');
    expect(source).toContain("Your original reservation remains active.");
  });

  it("returns explicit reschedule provenance", () => {
    expect(source).toContain("rescheduled: Boolean(rescheduledFrom)");
    expect(source).toContain("rescheduled_from_reservation_id");
  });
});
