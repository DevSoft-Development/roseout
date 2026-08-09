import { afterEach, describe, expect, it } from "vitest";
import {
  buildEventProviderPageUrl,
  extractEventProviderRows,
  normalizeEventLifecycle,
} from "../ingestion";
import { normalizeNycEvent } from "../providers/nycEvents";
import { normalizeNycParksEvent } from "../providers/nycParks";
import { normalizeTicketmasterEvent } from "../providers/ticketmaster";

const originalTicketmasterKey = process.env.TICKETMASTER_API_KEY;
const originalNycEventsUrl = process.env.NYC_EVENTS_API_URL;
const originalNycParksUrl = process.env.NYC_PARKS_EVENTS_API_URL;

afterEach(() => {
  process.env.TICKETMASTER_API_KEY = originalTicketmasterKey;
  process.env.NYC_EVENTS_API_URL = originalNycEventsUrl;
  process.env.NYC_PARKS_EVENTS_API_URL = originalNycParksUrl;
});

describe("event provider ingestion", () => {
  it("builds bounded Ticketmaster paging with the official Discovery API contract", () => {
    process.env.TICKETMASTER_API_KEY = "test-key";
    const url = new URL(buildEventProviderPageUrl("ticketmaster", 2, 100, new Date("2026-08-09T20:00:00Z"))!);
    expect(url.hostname).toBe("app.ticketmaster.com");
    expect(url.pathname).toBe("/discovery/v2/events.json");
    expect(url.searchParams.get("apikey")).toBe("test-key");
    expect(url.searchParams.get("size")).toBe("100");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("startDateTime")).toBe("2026-08-09T20:00:00Z");
  });

  it("uses bounded Socrata-style limit/offset paging for configured NYC feeds", () => {
    process.env.NYC_EVENTS_API_URL = "https://data.cityofnewyork.us/resource/example.json?$order=start_date";
    const url = new URL(buildEventProviderPageUrl("nyc_events", 3, 75, new Date("2026-08-09T20:00:00Z"))!);
    expect(url.searchParams.get("$limit")).toBe("75");
    expect(url.searchParams.get("$offset")).toBe("225");
    expect(url.searchParams.get("$order")).toBe("start_date");
  });

  it("extracts Ticketmaster and generic NYC response collections without changing provider payloads", () => {
    const ticketmasterRows = [{ id: "tm-1" }];
    const nycRows = [{ event_id: "nyc-1" }];
    expect(extractEventProviderRows("ticketmaster", { _embedded: { events: ticketmasterRows } })).toEqual(ticketmasterRows);
    expect(extractEventProviderRows("nyc_events", nycRows)).toEqual(nycRows);
    expect(extractEventProviderRows("nyc_parks", { results: nycRows })).toEqual(nycRows);
  });

  it("marks expired provider events completed and keeps cancelled events non-searchable", () => {
    const expired = normalizeNycEvent({
      event_id: "nyc-old",
      event_name: "Past Outdoor Movie",
      start_date: "2026-08-01",
      borough: "Queens",
    });
    const lifecycle = normalizeEventLifecycle(expired, new Date("2026-08-09T20:00:00Z"));
    expect(lifecycle.status).toBe("completed");
    expect(lifecycle.searchable).toBe(false);

    const cancelled = normalizeTicketmasterEvent({
      id: "tm-cancelled",
      name: "Cancelled Concert",
      dates: {
        start: { dateTime: "2026-09-01T20:00:00-04:00" },
        status: { code: "cancelled" },
      },
    });
    expect(normalizeEventLifecycle(cancelled, new Date("2026-08-09T20:00:00Z")).searchable).toBe(false);
  });

  it("keeps all three merged provider normalizers compatible with ingestion inputs", () => {
    expect(normalizeTicketmasterEvent({
      id: "tm-2",
      name: "Concert",
      dates: { start: { dateTime: "2026-09-01T20:00:00-04:00" } },
    }).provider).toBe("ticketmaster");

    expect(normalizeNycEvent({
      event_id: "nyc-2",
      event_name: "City Event",
      start_date: "2026-09-02",
    }).provider).toBe("nyc_events");

    expect(normalizeNycParksEvent({
      event_id: "parks-2",
      name: "Park Event",
      start_date: "2026-09-03",
    }).provider).toBe("nyc_parks");
  });
});
