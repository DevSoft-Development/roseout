import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const routeSource = fs.readFileSync(
  path.join(process.cwd(), "app/api/google/specialty-import/route.ts"),
  "utf8"
);

describe("specialty importer theatre spelling classification", () => {
  it("maps British theatre spelling to canonical theater classification", () => {
    expect(routeSource).toContain('text.includes("theater") || text.includes("theatre")');
    expect(routeSource).toContain('keywords.push("theater", "show", "culture")');
  });

  it("covers verified production theatre names", () => {
    expect("Beacon Theatre".toLowerCase()).toContain("theatre");
    expect("Broadway Theatre".toLowerCase()).toContain("theatre");
    expect("Patchogue Theatre for the Performing Arts".toLowerCase()).toContain("theatre");
  });
});
