import { describe, expect, it } from "vitest";
import { buildLocationSearchProfile } from "./buildLocationSearchProfile";

const cases = [
  ["bowling", "bowling"],
  ["karaoke", "karaoke"],
  ["live music", "live_music"],
  ["comedy club", "comedy"],
  ["art gallery", "gallery"],
] as const;

describe("canonical activity profile coverage", () => {
  it.each(cases)("maps %s into canonical activity category %s", (activityType, expectedCategory) => {
    const profile = buildLocationSearchProfile({
      id: `test-${expectedCategory}`,
      name: `Test ${activityType}`,
      activityName: `Test ${activityType}`,
      locationType: "activity",
      activityType,
      primaryCategory: activityType,
      categories: [activityType],
      latitude: 40.75,
      longitude: -73.95,
      active: true,
      searchable: true,
      hidden: false,
      isLowLevel: false,
    });

    expect(profile.primaryDomain).toBe("activity");
    expect(profile.supportedDomains).toContain("activity");
    expect(profile.activityCategories).toContain(expectedCategory);
    expect(profile.latitude).toBe(40.75);
    expect(profile.longitude).toBe(-73.95);
  });

  it("does not treat the generic word restaurant as dinner evidence", async () => {
    const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../v2/scoring/scoreCandidates.ts", import.meta.url), "utf8"));
    const dinnerRegexLine = source.split("\n").find((line) => line.includes("const dinnerEvidence"));
    expect(dinnerRegexLine).toBeTruthy();
    expect(dinnerRegexLine).not.toMatch(/\|restaurant\//);
    expect(source).toContain("matched verified dinner evidence");
  });
});
