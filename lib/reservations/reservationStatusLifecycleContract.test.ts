import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const cleanup = fs.readFileSync(
  path.join(repoRoot, "supabase/functions/reservation-status-cleanup/index.ts"),
  "utf8",
);
const dashboardUpdate = fs.readFileSync(
  path.join(repoRoot, "app/reserve/dashboard/reservations/update/route.ts"),
  "utf8",
);

describe("reservation status lifecycle contract", () => {
  it("only auto-marks unattended pre-arrival reservations as no-show", () => {
    expect(cleanup).toContain('.in("status", ["pending", "confirmed"])');
    expect(cleanup).not.toContain('["pending", "confirmed", "arrived", "checked_in"]');
  });

  it("uses the shared canonical status normalizer for dashboard writes", () => {
    expect(dashboardUpdate).toContain("normalizeReservationStatus");
    expect(dashboardUpdate).toContain("RESERVATION_STATUSES");
  });

  it("accepts legacy aliases but persists canonical checked-in and seated states", () => {
    expect(dashboardUpdate).toContain('"arrived"');
    expect(dashboardUpdate).toContain('"occupied"');
    expect(dashboardUpdate).toContain("return String(normalizeReservationStatus(status))");
    expect(dashboardUpdate).toContain('status === "checked_in"');
  });

  it("does not silently coerce unknown statuses to pending", () => {
    expect(dashboardUpdate).toContain("if (!acceptedStatuses.has(status)) return \"\"");
  });
});
