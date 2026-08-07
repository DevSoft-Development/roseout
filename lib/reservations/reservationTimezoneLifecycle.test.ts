import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { reservationNewYorkInstant } from "../../supabase/functions/_shared/reservationTime";

const migration = readFileSync(
  "supabase/migrations/20260807034500_fix_reservation_timezone_and_token_lifecycle.sql",
  "utf8",
);
const cleanup = readFileSync(
  "supabase/functions/reservation-status-cleanup/index.ts",
  "utf8",
);

describe("reservation timezone and management-link lifecycle", () => {
  it("anchors reservation instants to America/New_York", () => {
    expect(migration).toContain("at time zone 'America/New_York'");
    expect(migration).toContain("toh_reservation_start_at_ny");
    expect(reservationNewYorkInstant("2026-08-15", "19:00").toISOString()).toBe(
      "2026-08-15T23:00:00.000Z",
    );
    expect(reservationNewYorkInstant("2026-12-15", "19:00").toISOString()).toBe(
      "2026-12-16T00:00:00.000Z",
    );
  });

  it("keeps management tokens valid through the reservation lifecycle", () => {
    expect(migration).toContain("now() + interval '72 hours'");
    expect(migration).toContain("reservation_start + interval '24 hours'");
    expect(migration).toContain("toh_guard_reservation_token_expiry");
  });

  it("creates canonical 24-hour and 2-hour reminders at the database boundary", () => {
    expect(migration).toContain("reservation_start - interval '24 hours'");
    expect(migration).toContain("reservation_start - interval '2 hours'");
    expect(migration).toContain("on conflict (reservation_id, reminder_type) do update");
  });

  it("respects terminal status, email availability, and location reminder settings", () => {
    expect(migration).toContain("guest24h");
    expect(migration).toContain("guest2h");
    expect(migration).toContain("Email reminders are disabled for this location.");
    expect(migration).toContain("Reservation has no customer email.");
    expect(migration).toContain("cancelled', 'completed', 'no_show', 'declined");
  });

  it("uses the same New York instant for no-show cleanup", () => {
    expect(cleanup).toContain("reservationNewYorkInstant");
    expect(cleanup).not.toContain("new Date(`${row.reservation_date}T");
  });
});
