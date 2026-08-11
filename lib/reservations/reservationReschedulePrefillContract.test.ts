import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const bookingPage = fs.readFileSync(
  path.join(repoRoot, "app/reserve/location/[locationId]/page.tsx"),
  "utf8",
);
const confirmationPage = fs.readFileSync(
  path.join(repoRoot, "app/reserve/confirmation/[token]/page.tsx"),
  "utf8",
);

describe("reservation reschedule contact prefill contract", () => {
  it("loads the original reservation through the existing management token endpoint", () => {
    expect(bookingPage).toContain(
      "/api/reserve/confirmation?token=${encodeURIComponent(rescheduleToken)}",
    );
    expect(bookingPage).toContain("setName(String(reservation.customer_name || \"\"))");
    expect(bookingPage).toContain("setEmail(String(reservation.customer_email || \"\"))");
    expect(bookingPage).toContain("setPhone(String(reservation.customer_phone || \"\"))");
    expect(bookingPage).toContain(
      "setNotes(String(reservation.special_request || reservation.notes || \"\"))",
    );
  });

  it("does not put customer contact PII into the reschedule URL", () => {
    expect(confirmationPage).toContain("rescheduleToken=${token}");
    expect(confirmationPage).not.toContain("customer_email=");
    expect(confirmationPage).not.toContain("customer_phone=");
    expect(confirmationPage).not.toContain("customer_name=");
  });

  it("rejects a prefill token that resolves to a different location", () => {
    expect(bookingPage).toContain(
      "String(reservation.location_id) !== locationId",
    );
    expect(bookingPage).toContain(
      "This reservation link does not match this location.",
    );
  });
});
