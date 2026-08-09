import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("specialty importer billiards classification", () => {
  it("keeps singular and plural billiards venues out of generic specialty", () => {
    const route = readFileSync(
      join(process.cwd(), "app/api/google/specialty-import/route.ts"),
      "utf8",
    );

    expect(route).toContain('containsStandaloneImportTerm(text, "billiard")');
    expect(route).toContain('containsStandaloneImportTerm(text, "billiards")');
    expect(route).toContain('if (hasBilliardsEvidence(text)) return "billiards";');
    expect(route).toContain('keywords.push("billiards", "pool hall", "games", "date night")');
    expect(route).not.toContain('if (text.includes("pool")) return "billiards";');
  });
});
