import { describe, expect, it } from "vitest";

import {
  GOOGLE_MATCH_ACCEPT_THRESHOLD,
  GOOGLE_MATCH_REVIEW_THRESHOLD,
  buildGoogleNoMatchDiagnostics,
} from "./google-match-diagnostics";

describe("Google no-match diagnostics", () => {
  it("preserves the best rejected candidate and confidence evidence", () => {
    const diagnostics = buildGoogleNoMatchDiagnostics({
      status: "no_match",
      confidence: 48,
      place: {
        id: "candidate-1",
        displayName: { text: "Topaze Restaurant" },
        formattedAddress: "1875 Utica Ave, Brooklyn, NY 11234, USA",
        primaryType: "caribbean_restaurant",
        types: ["caribbean_restaurant", "restaurant"],
        location: { latitude: 40.62, longitude: -73.93 },
      },
      evidence: {
        query: "TOPAZE RESTAURANT & JERK CHICKEN Brooklyn NY",
        nameSimilarity: 0.5,
        distanceMeters: 83,
      },
    });

    expect(diagnostics).toMatchObject({
      version: "google-match-diagnostics-v1",
      rejectionReason: "confidence_below_review_threshold",
      confidence: 48,
      thresholds: {
        review: GOOGLE_MATCH_REVIEW_THRESHOLD,
        matched: GOOGLE_MATCH_ACCEPT_THRESHOLD,
      },
      candidate: {
        placeId: "candidate-1",
        displayName: "Topaze Restaurant",
        primaryType: "caribbean_restaurant",
        types: ["caribbean_restaurant", "restaurant"],
      },
      evidence: {
        nameSimilarity: 0.5,
        distanceMeters: 83,
      },
    });
  });

  it("records Google search reasons when no candidate exists", () => {
    const diagnostics = buildGoogleNoMatchDiagnostics({
      status: "no_match",
      confidence: 0,
      place: null,
      evidence: { reason: "missing_query" },
    });

    expect(diagnostics).toMatchObject({
      rejectionReason: "missing_query",
      confidence: 0,
      candidate: null,
    });
  });

  it("uses no_candidate when Google returns nothing without a more specific reason", () => {
    const diagnostics = buildGoogleNoMatchDiagnostics({
      status: "no_match",
      confidence: 0,
      place: null,
      evidence: {},
    });

    expect(diagnostics.rejectionReason).toBe("no_candidate");
  });
});
