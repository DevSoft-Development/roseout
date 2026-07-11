import { describe, expect, it } from "vitest";
import {
  extractNamedLocationAnchor,
  normalizeAnchorName,
} from "../anchoredNearby";

describe("named-location anchored nearby intent", () => {
  it.each([
    ["Restaurant near Gaming City in Astoria", "restaurant", "Gaming City", "Astoria", "near"],
    ["Restaurants close to Gaming City", "restaurant", "Gaming City", null, "close_to"],
    ["Dinner near Museum of the Moving Image", "restaurant", "Museum of the Moving Image", null, "near"],
    ["Food next to Bowl 360", "restaurant", "Bowl 360", null, "next_to"],
    ["Activities near Peter Luger", "activity", "Peter Luger", null, "near"],
    ["Something fun near Carbone", "activity", "Carbone", null, "near"],
    ["Restaurant within a 15-minute walk of Gaming City", "restaurant", "Gaming City", null, "walking_distance_from"],
  ])("extracts %s", (query, domain, name, area, relationship) => {
    const result = extractNamedLocationAnchor(query);
    expect(result).toMatchObject({
      requestedDomain: domain,
      rawName: name,
      areaHint: area,
      relationship,
    });
  });

  it.each([
    "restaurant and gaming activity nearby",
    "dinner and arcade nearby",
    "restaurant near an arcade",
    "restaurant and something fun in Astoria",
  ])("does not treat generic search as a named anchor: %s", (query) => {
    expect(extractNamedLocationAnchor(query)).toBeNull();
  });

  it("normalizes punctuation and legal suffixes", () => {
    expect(normalizeAnchorName("The Gaming City, LLC")).toBe("gaming city");
  });

  it("uses the explicit walking limit as the radius", () => {
    expect(extractNamedLocationAnchor("Restaurant within a 15-minute walk of Gaming City")?.maxDistanceMiles).toBe(0.75);
  });
});
