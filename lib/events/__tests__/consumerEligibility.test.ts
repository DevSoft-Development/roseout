import { describe, expect, it } from "vitest";
import { classifyNycConsumerEventEligibility } from "../providers/consumerEligibility";
import { normalizeNycEvent } from "../providers/nycEvents";
import { normalizeNycParksEvent } from "../providers/nycParks";

const futureWindow = {
  start_date_time: "2026-08-15T18:00:00.000",
  end_date_time: "2026-08-15T20:00:00.000",
};

describe("NYC consumer event eligibility", () => {
  it.each([
    ["Permitted Film Event", "Theater Load in and Load Outs"],
    ["124 Street and 125th Street Production Parking Aug 6 - Aug 20", "Production Event"],
    ["closed", "Special Event"],
    ["East Meadow Closure", "Special Event"],
    ["Lawn Closures & maintenance", "Special Event"],
    ["Construction", "Special Event"],
    ["2026 No Amplified Sound", "Special Event"],
    ["Miscellaneous", "Special Event"],
    ["Soccer - Non Regulation", "Sport - Youth"],
  ])("suppresses operational or generic permit inventory: %s", (title, eventType) => {
    expect(classifyNycConsumerEventEligibility({ title, eventType }).searchable).toBe(false);
  });

  it.each([
    ["SummerStage Festival - August", "Special Event"],
    ["Billion Oyster Project Field Events at Bush Terminal Park", "Special Event"],
    ["Outdoor Movie Night", "Special Event"],
    ["Jazz in the Park", "Special Event"],
    ["Brooklyn Cup Final", "Sport - Youth"],
    ["NYC Soccer Tournament", "Sport - Adult"],
  ])("keeps consumer-facing inventory searchable: %s", (title, eventType) => {
    expect(classifyNycConsumerEventEligibility({ title, eventType }).searchable).toBe(true);
  });

  it("marks noisy NYC permitted-event rows non-searchable during normalization", () => {
    const event = normalizeNycEvent({
      event_id: "noise-1",
      event_name: "Permitted Film Event",
      event_type: "Theater Load in and Load Outs",
      event_borough: "Manhattan",
      ...futureWindow,
    });

    expect(event.searchable).toBe(false);
    expect(event.status).toBe("scheduled");
  });

  it("applies the same quality gate to generic Parks permit labels", () => {
    const miscellaneous = normalizeNycParksEvent({
      event_id: "noise-parks-generic-1",
      event_name: "Miscellaneous",
      event_type: "Special Event",
      event_borough: "Brooklyn",
      ...futureWindow,
    });
    const soccerPermit = normalizeNycParksEvent({
      event_id: "noise-parks-generic-2",
      event_name: "Soccer - Non Regulation",
      event_type: "Sport - Youth",
      event_borough: "Brooklyn",
      ...futureWindow,
    });

    expect(miscellaneous.searchable).toBe(false);
    expect(soccerPermit.searchable).toBe(false);
  });

  it("does not suppress a real consumer-facing Parks event", () => {
    const event = normalizeNycParksEvent({
      event_id: "consumer-parks-1",
      event_name: "SummerStage Festival - August",
      event_type: "Special Event",
      event_borough: "Manhattan",
      ...futureWindow,
    });

    expect(event.searchable).toBe(true);
  });

  it("does not suppress named sports events just because they use a Parks sports type", () => {
    const event = normalizeNycParksEvent({
      event_id: "consumer-parks-sports-1",
      event_name: "Brooklyn Cup Final",
      event_type: "Sport - Youth",
      event_borough: "Brooklyn",
      ...futureWindow,
    });

    expect(event.searchable).toBe(true);
  });
});
