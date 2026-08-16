import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("location menu workspace", () => {
  it("uses the friendly owner workflow around the live menu editor", () => {
    const page = readFileSync("app/locations/dashboard/menu/page.tsx", "utf8");
    expect(page).toContain("Build what guests can browse");
    expect(page).toContain("Create a section");
    expect(page).toContain("Add the items");
    expect(page).toContain("Preview, then publish");
    expect(page).toContain("embedded");
  });
});
