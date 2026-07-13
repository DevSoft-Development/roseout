import { describe, expect, it } from "vitest";
import {
  activityRecoveryTermsForQuery,
  ENTERTAINMENT_ACTIVITY_RECOVERY_TERMS,
  RELAXED_ACTIVITY_BLOCKED_RECOVERY_TERMS,
  RELAXED_ACTIVITY_RECOVERY_TERMS,
} from "../relaxedActivityRecovery";

const relaxedQueries = [
  "relaxed activity",
  "low-key activity",
  "quiet activity",
  "peaceful date",
  "casual activity",
];

describe("relaxed activity recovery", () => {
  it.each(relaxedQueries)("keeps nightlife out of %s", (query) => {
    const terms = activityRecoveryTermsForQuery(query);

    expect(terms).toEqual(expect.arrayContaining([
      "museum",
      "art gallery",
      "park",
      "board games",
      "mini golf",
    ]));

    for (const blocked of RELAXED_ACTIVITY_BLOCKED_RECOVERY_TERMS) {
      expect(terms).not.toContain(blocked);
    }
  });

  it("keeps relaxed and entertainment buckets separate", () => {
    const relaxed = new Set(RELAXED_ACTIVITY_RECOVERY_TERMS);

    for (const entertainmentTerm of ENTERTAINMENT_ACTIVITY_RECOVERY_TERMS) {
      expect(relaxed.has(entertainmentTerm as never)).toBe(false);
    }
  });

  it("preserves entertainment recovery for explicit entertainment intent", () => {
    const terms = activityRecoveryTermsForQuery("karaoke and live music tonight");

    expect(terms).toEqual(expect.arrayContaining([
      "karaoke",
      "live music",
      "entertainment",
    ]));
  });
});
