import { describe, expect, it } from "vitest";
import {
  containsStandaloneImportTerm,
  hasPerfumeMakingEvidence,
} from "@/lib/search/specialtyImportText";

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

describe("hasPerfumeMakingEvidence", () => {
  it("rejects perfume retail identity without an outing signal", () => {
    for (const value of [
      "Perfumania",
      "Fragrance Shop New York",
      "Aedes Perfumery",
      "Kilian Paris perfume store",
      "Perfume Americana Wholesale",
      "Luxury Artisan Perfumes & Custom Fragrances",
    ]) {
      expect(hasPerfumeMakingEvidence(value)).toBe(false);
    }
  });

  it("accepts explicit perfume-making experience evidence", () => {
    for (const value of [
      "perfume making workshop",
      "fragrance blending class",
      "create your own fragrance experience",
      "scent making lesson",
      "perfume workshop sessions",
    ]) {
      expect(hasPerfumeMakingEvidence(value)).toBe(true);
    }
  });
});
