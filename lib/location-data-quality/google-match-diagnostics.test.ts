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
        query: "TOPAZE RESTAURANT & JERK CHICKEN 1875 UTICA AVENUE Brooklyn NY",
        nameSimilarity: 0.5,
        distanceMeters: 83,
      },
    });

    expect(diagnostics).toMatchObject({
      version: "google-match-diagnostics-v2",
      rejectionReason: "confidence_below_review_threshold",
      confidence: 48,
      thresholds: {
        review: GOOGLE_MATCH_REVIEW_THRESHOLD,
        matched: GOOGLE_MATCH_ACCEPT_THRESHOLD,
      },
      source: {
        name: "TOPAZE RESTAURANT & JERK CHICKEN",
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
      disposition: {
        category: "unresolved",
        recommendedAction: "manual_review",
      },
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

  it("classifies a different business at the same address as likely closed or renamed", () => {
    const diagnostics = buildGoogleNoMatchDiagnostics({
      status: "no_match",
      confidence: 25,
      place: {
        id: "broadway-lounge",
        displayName: { text: "Broadway Lounge" },
        formattedAddress: "1535 Broadway, New York, NY 10036, USA",
        primaryType: "lounge_bar",
        types: ["lounge_bar", "night_club", "bar", "restaurant"],
      },
      evidence: {
        query: "TIMES SQUARE CAFE 1535 BROADWAY Manhattan NY",
        addressMatch: true,
        distanceMeters: 47,
        nameSimilarity: 0,
      },
    });

    expect(diagnostics.disposition).toMatchObject({
      category: "likely_closed_or_renamed",
      confidence: "medium",
      recommendedAction: "verify_then_unpublish",
    });
  });

  it("classifies a parent facility at the same address as an embedded venue review", () => {
    const diagnostics = buildGoogleNoMatchDiagnostics({
      status: "no_match",
      confidence: 5,
      place: {
        id: "criminal-court",
        displayName: { text: "New York County Criminal Court" },
        formattedAddress: "100 Centre St, New York, NY 10013, USA",
        primaryType: "courthouse",
        types: ["courthouse", "government_office"],
      },
      evidence: {
        query: "CRIMINAL COURT BLDG CAFETERIA 100 CENTRE STREET Manhattan NY",
        addressMatch: true,
        distanceMeters: 23,
        nameSimilarity: 0.4,
      },
    });

    expect(diagnostics.disposition).toMatchObject({
      category: "parent_venue_or_embedded",
      confidence: "high",
      recommendedAction: "verify_embedded_venue",
    });
  });

  it("classifies a premise-only result as address only", () => {
    const diagnostics = buildGoogleNoMatchDiagnostics({
      status: "no_match",
      confidence: 0,
      place: {
        id: "address-only",
        displayName: { text: "236 E 58th St" },
        formattedAddress: "236 E 58th St, New York, NY 10022, USA",
        primaryType: "subpremise",
        types: ["subpremise", "street_address"],
      },
      evidence: {
        query: "TOWNHOUSE OF NY 236 EAST 58 STREET Manhattan NY",
        addressMatch: true,
        distanceMeters: 48,
        nameSimilarity: 0,
      },
    });

    expect(diagnostics.disposition).toMatchObject({
      category: "address_only",
      confidence: "high",
      recommendedAction: "verify_source_record",
    });
  });

  it("flags a person-like source name resolving only to an address as bad source data", () => {
    const diagnostics = buildGoogleNoMatchDiagnostics({
      status: "no_match",
      confidence: 5,
      place: {
        id: "940-manhattan",
        displayName: { text: "940 Manhattan Ave" },
        formattedAddress: "940 Manhattan Ave, Brooklyn, NY 11222, USA",
        primaryType: "premise",
        types: ["premise", "street_address"],
      },
      evidence: {
        query: "KRIS & ALICJA ZOLNIEROWICZ 940 MANHATTAN AVENUE Brooklyn NY",
        addressMatch: true,
        distanceMeters: 26,
        nameSimilarity: 0,
      },
    });

    expect(diagnostics.disposition).toMatchObject({
      category: "bad_source_name",
      confidence: "high",
      recommendedAction: "repair_source_name",
    });
  });

  it("keeps a distant conflicting business unresolved", () => {
    const diagnostics = buildGoogleNoMatchDiagnostics({
      status: "no_match",
      confidence: 0,
      place: {
        id: "peppas",
        displayName: { text: "Peppa's Jerk Chicken" },
        formattedAddress: "791 Prospect Pl, Brooklyn, NY 11216, USA",
        primaryType: "chicken_restaurant",
        types: ["chicken_restaurant", "caribbean_restaurant", "restaurant"],
      },
      evidence: {
        query: "TOPAZE RESTAURANT & JERK CHICKEN 1875 UTICA AVENUE Brooklyn NY",
        addressMatch: false,
        addressConflict: true,
        distanceMeters: 5662,
        nameSimilarity: 0.4,
      },
    });

    expect(diagnostics.disposition).toMatchObject({
      category: "unresolved",
      recommendedAction: "manual_review",
    });
  });
});
