import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("app/api/google/specialty-import/route.ts", "utf8");

describe("specialty importer art and DIY classification", () => {
  it("maps explicit art classes to the canonical art_class tag", () => {
    expect(route).toContain('if (text.includes("art class")) return "art_class";');
    expect(route).toContain('if (text.includes("art class")) keywords.push("art class", "creative");');
  });

  it("maps explicit DIY workshops to the canonical craft_workshop tag", () => {
    expect(route).toContain('if (text.includes("diy")) return "craft_workshop";');
    expect(route).toContain('if (text.includes("diy")) keywords.push("diy workshop", "craft workshop", "creative");');
  });

  it("keeps art classes and DIY workshops in the creative date-style lane", () => {
    expect(route).toMatch(/text\.includes\("dance"\)\s*\|\|\s*text\.includes\("art class"\)\s*\|\|\s*text\.includes\("diy"\)/);
  });
});
