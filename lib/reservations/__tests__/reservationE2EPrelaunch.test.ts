import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getInternalReservationHref } from "@/lib/reservation";
import {
  addReservationDays,
  newYorkTodayISO,
  updateReservationDatePart,
} from "@/lib/reservations/reservationDate";

const reservePage = readFileSync(
  "app/reserve/location/[locationId]/page.tsx",
  "utf8",
);
const profileTemplate = readFileSync(
  "app/locations/[type]/[locationId]/template.tsx",
  "utf8",
);
const demoRoute = readFileSync(
  "app/api/admin/demo/theouthaven-lounge/route.ts",
  "utf8",
);
const dedupeMigration = readFileSync(
  "supabase/migrations/20260807163325_dedupe_theouthaven_lounge_reservation_inventory.sql",
  "utf8",
);

describe("reservation public-to-booking E2E safeguards", () => {
  it("routes internal reservations through the canonical location booking page", () => {
    expect(
      getInternalReservationHref({
        id: "location-123",
        location_type: "restaurant",
      }),
    ).toBe("/reserve/location/location-123?type=restaurant");

    expect(
      getInternalReservationHref({
        id: "activity-456",
        location_type: "activity",
      }),
    ).toBe("/reserve/location/activity-456?type=activity");
  });

  it("uses New York calendar dates instead of UTC date slicing", () => {
    expect(newYorkTodayISO(new Date("2026-08-08T02:00:00.000Z"))).toBe(
      "2026-08-07",
    );
    expect(addReservationDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(
      updateReservationDatePart("2026-01-31", "month", 2, "2026-01-01"),
    ).toBe("2026-02-28");
  });

  it("does not rely on the browser-native date picker", () => {
    expect(reservePage).toContain('aria-label="Reservation month"');
    expect(reservePage).toContain('aria-label="Reservation day"');
    expect(reservePage).toContain('aria-label="Reservation year"');
    expect(reservePage).toContain('label: "Tomorrow"');
    expect(reservePage).toContain('label: "+7 Days"');
    expect(reservePage).not.toContain('type="date"');
  });

  it("exposes an internal reservation CTA only on the profile surface", () => {
    expect(profileTemplate).toContain("Reserve on TheOutHaven");
    expect(profileTemplate).toContain("Reservations powered by TheOutHaven");
    expect(profileTemplate).toContain("ordinaryPublicLocation");
    expect(profileTemplate).toContain("demoPreview && demoTagged");
    expect(profileTemplate).toContain("pathSegments.length === 3");
    expect(profileTemplate).toContain("!href || !isProfilePage");
  });

  it("self-heals the six canonical TheOutHaven Lounge reservation spaces", () => {
    for (const name of [
      "Table 1",
      "Table 2",
      "VIP Booth",
      "Bar Seats",
      "Private Room",
      "Patio Table",
    ]) {
      expect(demoRoute).toContain(name);
      expect(dedupeMigration).toContain(name);
    }

    expect(demoRoute).toContain("normalizeDemoReservationInventory");
    expect(demoRoute).toContain("duplicateIds");
    expect(dedupeMigration).toContain("row_number() over");
    expect(dedupeMigration).not.toContain("642a2ad6-c144-47b7-b9ff-f89554edf0da");
  });
});
