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

  it("bounds the live NYC permitted-events feed to non-ended inventory ordered upcoming-first", () => {
    process.env.NYC_EVENTS_API_URL = "https://data.cityofnewyork.us/resource/tvpp-9vvx.json";
    const url = new URL(buildEventProviderPageUrl("nyc_events", 0, 25, new Date("2026-08-09T20:00:00Z"))!);
    expect(url.searchParams.get("$limit")).toBe("25");
    expect(url.searchParams.get("$offset")).toBe("0");
    expect(url.searchParams.get("$order")).toBe("start_date_time ASC");
    expect(url.searchParams.get("$where")).toContain("end_date_time >= '2026-08-09T20:00:00.000'");
  });

  it("can scope the live permitted-events feed to Parks Department inventory", () => {
    process.env.NYC_PARKS_EVENTS_API_URL = "https://data.cityofnewyork.us/resource/tvpp-9vvx.json";
    const url = new URL(buildEventProviderPageUrl("nyc_parks", 1, 50, new Date("2026-08-09T20:00:00Z"))!);
    expect(url.searchParams.get("$limit")).toBe("50");
    expect(url.searchParams.get("$offset")).toBe("50");
    expect(url.searchParams.get("$order")).toBe("start_date_time ASC");
    expect(url.searchParams.get("$where")).toContain("end_date_time >= '2026-08-09T20:00:00.000'");
    expect(url.searchParams.get("$where")).toContain("event_agency = 'Parks Department'");
  });

  it("refuses the archived NYC Parks Open Data feed instead of spending import slots on 2013-2019 rows", () => {
    process.env.NYC_PARKS_EVENTS_API_URL = "https://data.cityofnewyork.us/resource/fudw-fgrp.json";
    expect(buildEventProviderPageUrl("nyc_parks", 0, 25, new Date("2026-08-09T20:00:00Z"))).toBeNull();
  });

  it("extracts Ticketmaster and generic NYC response collections without changing provider payloads", () => {
    const ticketmasterRows = [{ id: "tm-1" }];
    const nycRows = [{ event_id: "nyc-1" }];
    expect(extractEventProviderRows("ticketmaster", { _embedded: { events: ticketmasterRows } })).toEqual(ticketmasterRows);
    expect(extractEventProviderRows("nyc_events", nycRows)).toEqual(nycRows);
    expect(extractEventProviderRows("nyc_parks", { results: nycRows })).toEqual(nycRows);
  });

  it("normalizes the current NYC Permitted Event Information field names", () => {
    const event = normalizeNycEvent({
      event_id: "967169",
      event_name: "Summer Celebration",
      start_date_time: "2026-08-13T18:00:00.000",
      end_date_time: "2026-08-13T20:00:00.000",
      event_type: "Special Event",
      event_borough: "Manhattan",
      event_location: "Bryant Park Lawn",
    });

    expect(event.startsAt).toBe("2026-08-13T18:00:00.000Z");
    expect(event.endsAt).toBe("2026-08-13T20:00:00.000Z");
    expect(event.category).toBe("special_event");
    expect(event.borough).toBe("Manhattan");
    expect(event.city).toBe("New York");
    expect(event.venueName).toBe("Bryant Park Lawn");
  });

  it("normalizes current permitted-event fields when used as the Parks source", () => {
    const event = normalizeNycParksEvent({
      event_id: "parks-967169",
      event_name: "Park Celebration",
      start_date_time: "2026-08-14T18:00:00.000",
      end_date_time: "2026-08-14T20:00:00.000",
      event_type: "Special Event",
      event_borough: "Brooklyn",
      event_location: "Prospect Park",
    });

    expect(event.startsAt).toBe("2026-08-14T18:00:00.000Z");
    expect(event.endsAt).toBe("2026-08-14T20:00:00.000Z");
    expect(event.borough).toBe("Brooklyn");
    expect(event.venueName).toBe("Prospect Park");
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
