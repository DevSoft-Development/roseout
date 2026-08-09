import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const routePath = path.join(process.cwd(), "app/api/google/specialty-import/route.ts");
const route = fs.readFileSync(routePath, "utf8");

describe("specialty importer studio classification", () => {
  it("classifies art studios as art classes", () => {
    expect(route).toContain('text.includes("art class") || text.includes("art studio")');
    expect(route).toContain('return "art_class"');
    expect(route).toContain('keywords.push("art class", "art studio", "creative")');
  });

  it("classifies craft studios as craft workshops", () => {
    expect(route).toContain('text.includes("diy") || text.includes("craft studio")');
    expect(route).toContain('return "craft_workshop"');
    expect(route).toContain('keywords.push("diy workshop", "craft workshop", "craft studio", "creative")');
  });
});
