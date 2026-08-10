import { describe, expect, it } from "vitest";
import { resolveEventInventoryFallbackState } from "../scoreCandidates";

describe("explicit Event fallback observability", () => {
  it("marks static activity recovery as an Event fallback when canonical Event inventory is empty", () => {
    expect(resolveEventInventoryFallbackState({
      explicitEventRequested: true,
      canonicalEventCount: 0,
      activityCandidateCount: 19,
    })).toEqual({
      explicitEventRequested: true,
      canonicalEventCount: 0,
      activityCandidateCount: 19,
      fallbackActivityCount: 19,
      eventFallbackUsed: true,
      eventFallbackReason: "no_canonical_events_in_requested_window",
    });
  });

  it("does not mark fallback when canonical Events exist", () => {
    expect(resolveEventInventoryFallbackState({
      explicitEventRequested: true,
      canonicalEventCount: 4,
      activityCandidateCount: 20,
    })).toEqual({
      explicitEventRequested: true,
      canonicalEventCount: 4,
      activityCandidateCount: 20,
      fallbackActivityCount: 0,
      eventFallbackUsed: false,
      eventFallbackReason: null,
    });
  });

  it("does not mark ordinary activity searches as Event fallback", () => {
    expect(resolveEventInventoryFallbackState({
      explicitEventRequested: false,
      canonicalEventCount: 0,
      activityCandidateCount: 20,
    }).eventFallbackUsed).toBe(false);
  });
});
