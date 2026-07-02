import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("location dashboard menu link", () => {
  it("uses active location context", () => {
    const source = readFileSync("app/locations/dashboard/LocationsDashboardClient.tsx", "utf8");
    expect(source).toContain("getBusinessMenuEditorHref(location.id");
  });
});
