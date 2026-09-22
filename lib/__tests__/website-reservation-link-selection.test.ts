import { selectBestReservationLink } from "@/lib/websites/reservation-link-selection";

describe("website import reservation link selection", () => {
  it("prefers a known external provider over a same-site reservations page", () => {
    const result = selectBestReservationLink(new URL("https://restaurant.example"), [
      "https://restaurant.example/reservations",
      "https://resy.com/cities/ny/restaurant",
    ]);
    expect(result).toEqual({ url: "https://resy.com/cities/ny/restaurant", provider: "Resy" });
  });

  it("prefers a known booking provider even when it appears later", () => {
    const result = selectBestReservationLink(new URL("https://restaurant.example"), [
      "https://booking.example.com/reserve/restaurant",
      "https://www.opentable.com/r/restaurant",
    ]);
    expect(result.provider).toBe("OpenTable");
    expect(result.url).toContain("opentable.com");
  });

  it("accepts an unknown external booking service instead of a same-origin page", () => {
    const result = selectBestReservationLink(new URL("https://restaurant.example"), [
      "https://restaurant.example/book",
      "https://booking.vendor.example/table/123",
    ]);
    expect(result).toEqual({ url: "https://booking.vendor.example/table/123", provider: "External" });
  });

  it("does not overwrite location booking with a same-origin informational page", () => {
    const result = selectBestReservationLink(new URL("https://restaurant.example"), [
      "https://restaurant.example/reservations",
      "https://restaurant.example/book-a-table",
    ]);
    expect(result).toEqual({ url: null, provider: null });
  });
});
