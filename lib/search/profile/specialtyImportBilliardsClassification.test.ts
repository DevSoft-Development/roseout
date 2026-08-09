import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("specialty importer billiards classification", () => {
  it("keeps explicit billiards venues out of generic specialty", () => {
    const route = readFileSync(
      join(process.cwd(), "app/api/google/specialty-import/route.ts"),
      "utf8",
    );

    expect(route).toContain('if (text.includes("billiards")) return "billiards";');
    expect(route).toContain('keywords.push("billiards", "pool hall", "games", "date night")');
    expect(route).toContain('text.includes("billiards")');
    expect(route).not.toContain('if (text.includes("pool")) return "billiards";');
  });
});
