import { describe, expect, it } from "vitest";
import { EXACT_MENU_PHRASE_BOOST, findExactMenuPhraseMatch } from "../menuPhraseEvidence";

describe("multi-dish structured menu evidence", () => {
  it("recognizes verified coverage across separate signature items", () => {
    expect(findExactMenuPhraseMatch(
      ["steak", "steak and lobster", "lobster"],
      ["Prime ribeye steak", "Butter-poached lobster tail"],
    )).toBe("steak + lobster");
  });

  it("does not award multi-dish evidence when only one requested dish is verified", () => {
    expect(findExactMenuPhraseMatch(
      ["steak", "steak and lobster", "lobster"],
      ["Prime ribeye steak", "Truffle fries"],
    )).toBeNull();
  });

  it("keeps exact combined menu phrases as the strongest direct match", () => {
    expect(findExactMenuPhraseMatch(
      ["steak", "steak and lobster", "lobster"],
      ["Steak and lobster dinner"],
    )).toBe("steak and lobster");
  });

  it("uses a material boost for verified structured dish evidence", () => {
    expect(EXACT_MENU_PHRASE_BOOST).toBeGreaterThanOrEqual(12);
  });
});
