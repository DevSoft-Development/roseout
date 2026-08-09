import { describe, expect, it } from "vitest";
import { normalizeTicketmasterEvent } from "../../../events/providers/ticketmaster";
import { eventIsLiveForSearch, projectEventToSearchLocation } from "../../v2/retrieval/retrieveEventLocations";

describe("event inventory search contract", () => {
  it("projects provider events as activity-lane inventory with a real event detail URL", () => {
    const normalized = normalizeTicketmasterEvent({
      id: "tm-live-1",
      name: "Jazz in the Park",
      url: "https://example.test/tickets",
      dates: { start: { dateTime: "2026-09-04T19:30:00-04:00" }, status: { code: "onsale" } },
      classifications: [{ segment: { name: "Music" }, genre: { name: "Jazz" } }],
      _embedded: { venues: [{ name: "Park Stage", city: { name: "New York" }, state: { stateCode: "NY" } }] },
    });

    const projected = projectEventToSearchLocation({
      id: "a5f9488b-8dd3-4899-9002-2c8ae49b6f98",
      organization_id: null,
      location_id: null,
      title: normalized.title,
      description: normalized.description ?? null,
      category: normalized.category ?? null,
      subcategory: normalized.subcategory ?? null,
      venue_name: normalized.venueName ?? null,
      address: normalized.address ?? null,
      city: normalized.city ?? null,
      state: normalized.state ?? null,
      zip_code: normalized.zipCode ?? null,
      market: null,
      borough: null,
      county: null,
      latitude: normalized.latitude ?? null,
      longitude: normalized.longitude ?? null,
      starts_at: normalized.startsAt,
      ends_at: normalized.endsAt ?? null,
      timezone: normalized.timezone,
      all_day: normalized.allDay,
      price_min: normalized.priceMin ?? null,
      price_max: normalized.priceMax ?? null,
      currency: normalized.currency ?? null,
      is_free: normalized.isFree ?? false,
      external_url: normalized.externalUrl ?? null,
      image_url: normalized.imageUrl ?? null,
      status: normalized.status,
      searchable: normalized.searchable,
      search_document: normalized.searchDocument,
    });

    expect(normalized.category).toBe("live_music");
    expect(projected.type).toBe("activity");
    expect(projected.inventory_type).toBe("event");
    expect(projected.location_type).toBe("event");
    expect(projected.id).toBe("event:a5f9488b-8dd3-4899-9002-2c8ae49b6f98");
    expect(projected.public_url).toBe("/events/a5f9488b-8dd3-4899-9002-2c8ae49b6f98");
    expect(projected.booking_url).toBe("https://example.test/tickets");
  });

  it("keeps long-running events searchable while their end time is still in the future", () => {
    const now = new Date("2026-08-09T21:45:00.000Z");
    expect(eventIsLiveForSearch({
      starts_at: "2026-07-01T14:00:00.000Z",
      ends_at: "2026-08-31T22:00:00.000Z",
    }, now)).toBe(true);
  });

  it("rejects events whose effective end time has already passed", () => {
    const now = new Date("2026-08-09T21:45:00.000Z");
    expect(eventIsLiveForSearch({
      starts_at: "2026-08-08T19:00:00.000Z",
      ends_at: "2026-08-08T22:00:00.000Z",
    }, now)).toBe(false);
    expect(eventIsLiveForSearch({
      starts_at: "2026-08-08T19:00:00.000Z",
      ends_at: null,
    }, now)).toBe(false);
  });
});
