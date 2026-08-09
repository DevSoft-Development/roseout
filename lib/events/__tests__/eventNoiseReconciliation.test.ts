import { describe, expect, it } from "vitest";
import { nycOperationalNoiseEventIds } from "../ingestion";

describe("NYC operational event reconciliation", () => {
  it("suppresses previously imported NYC operational rows even when they are not refetched", () => {
    const events = [
      { id: "closed", title: "closed", category: "special_event", searchable: true },
      { id: "hudson", title: "Hudson Yards", category: "production_event", searchable: true },
      { id: "construction", title: "CROCHERON PARK GAZEBO CONSTRUCTION", category: "special_event", searchable: true },
      { id: "summerstage", title: "SummerStage Festival - August", category: "special_event", searchable: true },
    ];
    const sources = events.map((event) => ({ event_id: event.id, provider: "nyc_events" }));

    expect(nycOperationalNoiseEventIds({ events, sources })).toEqual([
      "closed",
      "hudson",
      "construction",
    ]);
  });

  it("does not suppress a deduplicated event that also has a non-NYC provider source", () => {
    const events = [
      { id: "shared", title: "Construction", category: "special_event", searchable: true },
    ];
    const sources = [
      { event_id: "shared", provider: "nyc_events" },
      { event_id: "shared", provider: "ticketmaster" },
    ];

    expect(nycOperationalNoiseEventIds({ events, sources })).toEqual([]);
  });

  it("ignores consumer-facing and already non-searchable inventory", () => {
    const events = [
      { id: "movie", title: "Outdoor Movie Night", category: "film", searchable: true },
      { id: "old", title: "closed", category: "special_event", searchable: false },
    ];
    const sources = [
      { event_id: "movie", provider: "nyc_parks" },
      { event_id: "old", provider: "nyc_parks" },
    ];

    expect(nycOperationalNoiseEventIds({ events, sources })).toEqual([]);
  });
});
