import { describe, expect, it } from "vitest";
import { countResponseResults, responseDomainInventory } from "../replayEvaluation";

const restaurant = { id: "r1", primary_domain: "restaurant" };
const activity = { id: "a1", primary_domain: "activity" };

describe("responseDomainInventory", () => {
  it("counts both domains when results are served only inside pairs", () => {
    const response = {
      restaurants: [],
      activities: [],
      pairs: [{ restaurant, activity }],
      sameVenueResults: [],
      builder: { restaurants: [], activities: [] },
    };

    const inventory = responseDomainInventory(response);
    expect([...inventory.servedDomains]).toEqual(expect.arrayContaining(["restaurant", "activity"]));
    expect(inventory.counts.restaurant).toBe(1);
    expect(inventory.counts.activity).toBe(1);
    expect(inventory.counts.pairs).toBe(1);
    expect(countResponseResults(response)).toBe(2);
  });

  it("counts same-venue cards as satisfying both requested domains", () => {
    const response = {
      restaurants: [],
      activities: [],
      pairs: [],
      sameVenueResults: [{ id: "same-1", primary_domain: "restaurant" }],
      builder: { restaurants: [], activities: [] },
    };

    const inventory = responseDomainInventory(response);
    expect(inventory.servedDomains.has("restaurant")).toBe(true);
    expect(inventory.servedDomains.has("activity")).toBe(true);
    expect(inventory.counts.sameVenue).toBe(1);
    expect(countResponseResults(response)).toBe(1);
  });

  it("counts builder lanes when partial mixed results are served there", () => {
    const response = {
      restaurants: [],
      activities: [],
      pairs: [],
      sameVenueResults: [],
      builder: { restaurants: [restaurant], activities: [activity] },
    };

    const inventory = responseDomainInventory(response);
    expect(inventory.servedDomains.has("restaurant")).toBe(true);
    expect(inventory.servedDomains.has("activity")).toBe(true);
    expect(inventory.counts.restaurant).toBe(1);
    expect(inventory.counts.activity).toBe(1);
  });

  it("still detects true wrong-slot primary-domain mismatches inside pairs", () => {
    const response = {
      restaurants: [],
      activities: [],
      pairs: [{
        restaurant: { id: "bad-r", primary_domain: "activity" },
        activity: { id: "bad-a", primary_domain: "restaurant" },
      }],
      sameVenueResults: [],
      builder: { restaurants: [], activities: [] },
    };

    const inventory = responseDomainInventory(response);
    expect(inventory.slotMismatches).toEqual(expect.arrayContaining([
      expect.objectContaining({ slot: "restaurant", id: "bad-r", primaryDomain: "activity" }),
      expect.objectContaining({ slot: "activity", id: "bad-a", primaryDomain: "restaurant" }),
    ]));
  });

  it("returns zero only when every public result surface is empty", () => {
    expect(countResponseResults({
      restaurants: [],
      activities: [],
      pairs: [],
      sameVenueResults: [],
      builder: { restaurants: [], activities: [] },
    })).toBe(0);
  });
});
