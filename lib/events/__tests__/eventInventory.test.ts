import { describe, expect, it } from "vitest";
import { buildEventDedupeFingerprint, normalizeCanonicalEvent } from "../normalization";
import { normalizeProviderEvents } from "../providers";
import { normalizeTicketmasterEvent } from "../providers/ticketmaster";
import { projectEventToSearchLocation } from "../../search/v2/retrieval/retrieveEventLocations";

describe("canonical event inventory", () => {
  it("deduplicates equivalent provider events by normalized title, venue, city, and start", () => {
    const first = buildEventDedupeFingerprint({
      title: "Jazz Night!",
      venueName: "Blue Room",
      city: "New York",
      startsAt: "2026-09-01T20:00:00-04:00",
    });
    const second = buildEventDedupeFingerprint({
      title: "  JAZZ NIGHT ",
      venueName: "Blue-Room",
      city: "NEW YORK",
      startsAt: "2026-09-02T00:00:00Z",
    });
    expect(second).toBe(first);
  });

  it("never makes draft, cancelled, or completed events searchable", () => {
    for (const status of ["draft", "cancelled", "completed"] as const) {
      const event = normalizeCanonicalEvent({
        provider: "native",
        providerEventId: `native-${status}`,
        title: "Organizer Event",
        startsAt: "2026-09-01T20:00:00-04:00",
        status,
        searchable: true,
      });
      expect(event.searchable).toBe(false);
    }
  });

  it("normalizes Ticketmaster music into the existing live_music Search V2 category", () => {
    const event = normalizeTicketmasterEvent({
      id: "tm-123",
      name: "Late Night Jazz",
      url: "https://example.test/event",
      dates: { start: { dateTime: "2026-09-01T20:00:00-04:00" }, status: { code: "onsale" } },
      classifications: [{ segment: { name: "Music" }, genre: { name: "Jazz" } }],
      _embedded: {
        venues: [{
          name: "Blue Room",
          city: { name: "New York" },
          state: { stateCode: "NY" },
          postalCode: "10001",
          timezone: "America/New_York",
          location: { latitude: "40.75", longitude: "-73.99" },
        }],
      },
      priceRanges: [{ min: 25, max: 60, currency: "USD" }],
      images: [{ url: "https://example.test/event.jpg" }],
    });

    expect(event.category).toBe("live_music");
    expect(event.searchable).toBe(true);
    expect(event.externalUrl).toBe("https://example.test/event");
    expect(event.priceMin).toBe(25);
  });

  it("isolates malformed provider rows instead of rejecting a whole import batch", () => {
    const result = normalizeProviderEvents("nyc_events", [
      { event_id: "nyc-1", event_name: "Outdoor Movie", start_date: "2026-09-02", borough: "Queens" },
      { event_name: "Missing id and date" },
    ]);
    expect(result.events).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
  });

  it("projects an event into the activity lane without pretending it is a location record", () => {
    const location = projectEventToSearchLocation({
      id: "5f4f2b58-690e-4ee1-8f13-7f527122c80c",
      organization_id: null,
      location_id: null,
      title: "Queens Summer Concert",
      description: "Live music outdoors",
      category: "live_music",
      subcategory: "jazz",
      venue_name: "Example Park",
      address: "1 Park Way",
      city: "New York",
      state: "NY",
      zip_code: "11368",
      market: "NYC CORE",
      borough: "Queens",
      county: "Queens",
      latitude: 40.75,
      longitude: -73.84,
      starts_at: "2026-09-03T23:00:00Z",
      ends_at: null,
      timezone: "America/New_York",
      all_day: false,
      price_min: 0,
      price_max: 0,
      currency: "USD",
      is_free: true,
      external_url: "https://example.test/concert",
      image_url: null,
      status: "scheduled",
      searchable: true,
      search_document: "Queens Summer Concert live music jazz",
    });

    expect(location.id).toBe("event:5f4f2b58-690e-4ee1-8f13-7f527122c80c");
    expect(location.inventory_type).toBe("event");
    expect(location.location_type).toBe("event");
    expect(location.public_url).toBe("/events/5f4f2b58-690e-4ee1-8f13-7f527122c80c");
    expect(location.booking_url).toBe("https://example.test/concert");
  });
});
