import fs from "node:fs";
import path from "node:path";

describe("reservation same-day preferred time contract", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "app/api/reserve/location/route.ts"),
    "utf8",
  );

  it("reuses the New York past-time guard when building GET availability", () => {
    expect(source).toContain(
      'import { isReservationTimeInPastNewYork } from "@/lib/reservations/reservationTime";',
    );
    expect(source).toContain(
      "!isReservationTimeInPastNewYork(reservationDate, slot.time)",
    );
  });

  it("filters elapsed times before they reach the preferred-time dropdown", () => {
    expect(source).toContain("slot.available &&");
    expect(source).toContain("available_slots");
  });
});
