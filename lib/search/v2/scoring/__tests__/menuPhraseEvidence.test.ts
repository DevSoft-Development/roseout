import { describe, expect, it } from "vitest";
import { EXACT_MENU_PHRASE_BOOST, findExactMenuPhraseMatch } from "../menuPhraseEvidence";

describe("menu phrase evidence", () => {
  it("matches the longest requested dish phrase inside a signature item", () => {
    expect(findExactMenuPhraseMatch(
      ["farfalle cacio e pepe", "farfalle", "cacio", "pepe"],
      ["wild mushroom tagliatelle", "farfalle cacio e pepe", "cheese ravioli"],
    )).toBe("farfalle cacio e pepe");
  });

  it("allows menu prices after the requested phrase", () => {
    expect(findExactMenuPhraseMatch(
      ["cacio e pepe", "cacio", "pepe"],
      ["cacio e pepe 32"],
    )).toBe("cacio e pepe");
  });

  it("does not combine separate menu items into a false exact dish match", () => {
    expect(findExactMenuPhraseMatch(
      ["lobster ravioli", "lobster", "ravioli"],
      ["lobster bisque", "cheese ravioli"],
    )).toBeNull();
  });

  it("normalizes ampersands without changing phrase boundaries", () => {
    expect(findExactMenuPhraseMatch(
      ["rigatoni and meatballs"],
      ["rigatoni & meatballs"],
    )).toBe("rigatoni and meatballs");
  });

  it("keeps the ranking boost bounded", () => {
    expect(EXACT_MENU_PHRASE_BOOST).toBe(8);
  });
});
