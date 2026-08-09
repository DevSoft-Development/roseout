import { describe, expect, it } from "vitest";
import { containsStandaloneImportTerm } from "@/lib/search/specialtyImportText";

describe("containsStandaloneImportTerm", () => {
  it("rejects spa inside space-like words", () => {
    for (const value of [
      "Event Space",
      "MakerSpace NYC",
      "BronxArtSpace",
      "ZeroSpace",
      "Cityview Rooftop Event Space & Lounge",
    ]) {
      expect(containsStandaloneImportTerm(value, "spa")).toBe(false);
    }
  });

  it("preserves real spa evidence across punctuation and phrases", () => {
    for (const value of [
      "spa",
      "couples spa",
      "massage spa in brooklyn",
      "blissful headspace spa(brooklyn)",
      "spa/bathhouse",
    ]) {
      expect(containsStandaloneImportTerm(value, "spa")).toBe(true);
    }
  });
});
