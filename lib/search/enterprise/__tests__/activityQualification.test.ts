import { describe, expect, it } from "vitest";
import { qualifyHookahCandidate, qualifyKaraokeCandidate, qualifyRelaxedActivity, qualifyRooftopCandidate, qualifySportsWatchCandidate } from "../activityQualification";

const row = (text: string) => ({ id: text, search_document: text } as any);

describe("specialized activity qualification", () => {
  it.each([
    [qualifyKaraokeCandidate, "private karaoke rooms", true],
    [qualifyKaraokeCandidate, "cocktail bar and lounge", false],
    [qualifyHookahCandidate, "shisha lounge", true],
    [qualifyHookahCandidate, "neighborhood bar", false],
    [qualifySportsWatchCandidate, "sports bar with live sports", true],
    [qualifySportsWatchCandidate, "pub and tavern", false],
    [qualifyRooftopCandidate, "rooftop bar", true],
    [qualifyRooftopCandidate, "outdoor seating and views", false],
    [qualifyRooftopCandidate, "terrace bar", true],
    [qualifyRelaxedActivity, "museum and art gallery", true],
    [qualifyRelaxedActivity, "nightclub with bowling theme", false],
  ])("qualifies evidence without generic false positives", (qualify, text, expected) => {
    expect(qualify(row(text)).matches).toBe(expected);
  });
});
