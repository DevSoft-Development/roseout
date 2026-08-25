import { describe, expect, it } from "vitest";
import {
  chooseBestReservationUrl,
  detectReservationProvider,
  normalizeReservationUrl,
} from "../reservation-providers";

describe("reservation provider URL validation", () => {
  it("accepts real provider booking pages", () => {
    expect(detectReservationProvider("https://www.opentable.com/nautilus-cafe")?.name).toBe("OpenTable");
    expect(detectReservationProvider("https://resy.com/cities/washington-dc/venues/the-dabney")?.name).toBe("Resy");
    expect(detectReservationProvider("https://tables.toasttab.com/restaurants/990e7dd3-5d97-4509-b1de-17fce6fec45f/findTime")?.name).toBe("Toast");
    expect(detectReservationProvider("https://tables.toasttab.com/restaurants/27ae14fa-44ed-41ce-a1fb-0260502c7a5f/reserve")?.name).toBe("Toast");
  });

  it("rejects Toast ordering URLs", () => {
    expect(normalizeReservationUrl("https://toasttab.com/nautilus-cafe/v3")).toBeNull();
    expect(normalizeReservationUrl("https://order.toasttab.com/online/ny-firehouse-grille-63-welcher-ave")).toBeNull();
    expect(normalizeReservationUrl("https://www.toasttab.com/local/order/example/r-123")).toBeNull();
  });

  it("rejects the generic Resy widget root", () => {
    expect(normalizeReservationUrl("https://widgets.resy.com/")).toBeNull();
    expect(normalizeReservationUrl("https://widgets.resy.com/?venueId=12345")).toBe("https://widgets.resy.com/?venueId=12345");
  });

  it("does not let an ordering URL beat a real reservation URL", () => {
    const best = chooseBestReservationUrl([
      "https://order.toasttab.com/online/example",
      "https://www.opentable.com/example-restaurant",
    ]);
    expect(best?.provider).toBe("OpenTable");
    expect(best?.url).toBe("https://opentable.com/example-restaurant");
  });
});
