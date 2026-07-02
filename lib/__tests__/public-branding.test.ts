import { describe, expect, it } from "vitest";
import { sanitizePublicBranding } from "../publicBranding";

describe("sanitizePublicBranding", () => {
  it("removes legacy search tokens and hides legacy score fields from public output", () => {
    const output = sanitizePublicBranding({
      search_keywords: ["roseout", "activity", "sports bar"],
      search_document: "Club Macanudo nightlife cigar club roseout activity",
      semantic_search_text: "Roseout activity idea",
      roseout_score: 0,
    }) as Record<string, unknown>;

    expect(JSON.stringify(output).toLowerCase()).not.toContain("roseout");
    expect(output.search_keywords).toEqual(["activity", "sports bar"]);
    expect(output.search_document).toBe(
      "Club Macanudo nightlife cigar club TheOutHaven activity",
    );
    expect(output.semantic_search_text).toBe("TheOutHaven activity idea");
    expect(output).not.toHaveProperty("roseout_score");
  });

  it("sanitizes nested public API payloads without removing useful cards", () => {
    const output = sanitizePublicBranding({
      restaurants: [
        { name: "Useful Spot", roseout_score: 10, tags: ["roseout", "date night"] },
      ],
      debugParity: { preview: "ROSEOUT result preview" },
      diagnostics: { source: "roseout.com" },
      cards: [{ name: "Card", description: "Found by Roseout" }],
    });

    expect(JSON.stringify(output).toLowerCase()).not.toContain("roseout");
    const payload = output as {
      restaurants: Array<Record<string, unknown>>;
      cards: Array<Record<string, unknown>>;
    };

    expect(payload.restaurants[0].tags).toEqual(["date night"]);
    expect(payload.restaurants[0]).not.toHaveProperty("roseout_score");
    expect(payload.cards[0].name).toBe("Card");
  });
});
