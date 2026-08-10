import { describe, expect, it } from "vitest";
import { resolveExplicitEventTemporalWindow } from "../retrieveEventLocations";

describe("explicit Event temporal windows", () => {
  const sundayEvening = new Date("2026-08-10T00:31:53.000Z"); // Sun Aug 9, 8:31 PM America/New_York

  it("keeps this weekend on the current Saturday/Sunday when searched Sunday evening", () => {
    const window = resolveExplicitEventTemporalWindow("events this weekend in Brooklyn", sundayEvening);
    expect(window).toEqual({
      kind: "this_weekend",
      startsAt: "2026-08-08T04:00:00.000Z",
      endsAt: "2026-08-10T03:59:59.999Z",
    });
  });

  it("keeps tonight inside the current local calendar day", () => {
    const window = resolveExplicitEventTemporalWindow("live music events tonight in Queens", sundayEvening);
    expect(window).toEqual({
      kind: "tonight",
      startsAt: "2026-08-09T04:00:00.000Z",
      endsAt: "2026-08-10T03:59:59.999Z",
    });
  });

  it("resolves tomorrow to the next New York calendar day", () => {
    const window = resolveExplicitEventTemporalWindow("events tomorrow in Manhattan", sundayEvening);
    expect(window).toEqual({
      kind: "tomorrow",
      startsAt: "2026-08-10T04:00:00.000Z",
      endsAt: "2026-08-11T03:59:59.999Z",
    });
  });

  it("does not impose a temporal window when the query does not ask for one", () => {
    expect(resolveExplicitEventTemporalWindow("events in Brooklyn", sundayEvening)).toBeNull();
  });
});
