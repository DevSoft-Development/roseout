import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("public location commerce API", () => {
  it("only exposes published active menu pages", () => {
    const source = readFileSync("app/api/public/location-commerce/[locationId]/route.ts", "utf8");
    expect(source).toContain('.eq("status", "published")');
    expect(source).toContain('.eq("is_active", true)');
  });
});
