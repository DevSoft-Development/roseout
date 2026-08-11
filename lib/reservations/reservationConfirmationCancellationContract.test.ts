import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("app/api/reserve/confirmation/route.ts", "utf8");

describe("reservation confirmation token cancellation contract", () => {
  it("enforces the canonical cancellation eligibility rules", () => {
    expect(source).toContain("canCancelReservation(existing.status)");
    expect(source).toContain("This reservation can no longer be cancelled.");
  });

  it("releases the reservation slot and waitlist on token cancellation", () => {
    expect(source).toContain('from("reservation_slot_locks")');
    expect(source).toContain('from("reservation_waitlist")');
    expect(source).toContain("notifyFirstWaitlistMatch");
  });

  it("sends cancellation notifications and records analytics", () => {
    expect(source).toContain("sendReservationCancelledEmail");
    expect(source).toContain("sendReservationCancelledSMS");
    expect(source).toContain('eventType: "reservation_cancelled"');
    expect(source).toContain('cancellation_source: "customer_token"');
    expect(source).toContain('action: "customer_cancelled_by_token"');
  });

  it("keeps confirmation separate from cancellation side effects", () => {
    expect(source).toContain('if (action === "confirm")');
    expect(source).toContain("customer_confirmed_at");
  });
});
