import { describe, expect, it } from "vitest";
import { rankActivityResults, rankRestaurantResults, scoreActivityQuality, scoreRestaurantQuality } from "../ranking";
import { activities, makeIntent, names, restaurants } from "./fixtures";

describe("enterprise search quality ranking", () => {
  it("ranks date/full-service restaurants above weak casual options for generic outing", () => {
    const intent = makeIntent("restaurant and rooftop drinks after walking distance");
    const candidates = restaurants.filter((r) => ["MOE EATS NYC", "Dave's Hot Chicken", "La Grande Boucherie", "Parker & Quinn", "OLIO E PIÙ Bryant Park"].includes(r.name!));
    const ranked = names(rankRestaurantResults(candidates.map((r) => ({ ...r })), intent));
    for (const strong of ["La Grande Boucherie", "Parker & Quinn", "OLIO E PIÙ Bryant Park"]) {
      expect(ranked.indexOf(strong)).toBeLessThan(ranked.indexOf("MOE EATS NYC"));
      expect(ranked.indexOf(strong)).toBeLessThan(ranked.indexOf("Dave's Hot Chicken"));
    }
  });

  it("reduces chicken/casual penalties when requested", () => {
    const generic = makeIntent("restaurant and rooftop drinks walking distance");
    const casual = makeIntent("casual chicken dinner and rooftop drinks walking distance");
    const daves = restaurants.find((r) => r.name === "Dave's Hot Chicken")!;
    expect(scoreRestaurantQuality({ ...daves }, casual).score).toBeGreaterThan(scoreRestaurantQuality({ ...daves }, generic).score);
  });

  it("ranks real rooftop venues above aggregators and suppresses theater unless requested", () => {
    const intent = makeIntent("restaurant and rooftop drinks after");
    const ranked = names(rankActivityResults(activities.filter((a) => ["Magic Hour Rooftop Bar & Lounge", "Dear Irving on Hudson Rooftop Bar", "Rooftop Bars NYC", "Winter Garden Theatre"].includes(a.name!)).map((a) => ({ ...a })), intent));
    expect(ranked.indexOf("Magic Hour Rooftop Bar & Lounge")).toBeLessThan(ranked.indexOf("Rooftop Bars NYC"));
    expect(ranked.indexOf("Dear Irving on Hudson Rooftop Bar")).toBeLessThan(ranked.indexOf("Rooftop Bars NYC"));
    expect(ranked).not.toContain("Winter Garden Theatre");
  });

  it("allows and boosts theaters when requested", () => {
    const intent = makeIntent("seafood dinner with theatre after");
    const winter = activities.find((a) => a.name === "Winter Garden Theatre")!;
    expect(scoreActivityQuality({ ...winter }, intent).score).toBeGreaterThan(0);
    expect(names(rankActivityResults([{ ...winter }], intent))).toContain("Winter Garden Theatre");
  });
});
