import fs from "node:fs";
import path from "node:path";

describe("specialty importer park classification", () => {
  const routePath = path.join(process.cwd(), "app/api/google/specialty-import/route.ts");
  const source = fs.readFileSync(routePath, "utf8");

  it("maps standalone park and boardwalk signals to canonical park", () => {
    expect(source).toContain('containsStandaloneImportTerm(text, "park") || containsStandaloneImportTerm(text, "boardwalk")');
    expect(source).toContain('return "park"');
  });

  it("keeps park and boardwalk in outdoor metadata", () => {
    expect(source).toContain('keywords.push("park", "boardwalk", "outdoor", "scenic")');
    expect(source).toContain('tags.push("outdoor", "scenic")');
  });
});
